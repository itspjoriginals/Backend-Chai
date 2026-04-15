import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js"
import { User } from "../models/user.model.js"
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async(userId) => {
    const user = await User.findById(userId);
    if (!user) {
    throw new ApiError(404, "Invalid user ID");
  }
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false});

    return { accessToken, refreshToken }
}

const registerUser = asyncHandler(async (req, res) => {
  
  const {fullName, email, username, password} = req.body;
  console.log("email : ", email);
  if(
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ){
    throw new ApiError(400, "All fields are required")
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }]
  })

  if(existedUser){
    throw new ApiError(409, "User with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  if(!avatarLocalPath){
    throw new ApiError(400, "Avatar file is required")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if(!avatar){
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase()
  })
  
  const createdUser = await User.findById(user._id).select("-passowrd -refreshToken")

  if(!createdUser){
    throw new ApiError(500, "Something went wrong while registering the user")
  }

  return res.status(201).json(
    new ApiResponse(200, createdUser, "User registered Successfully")
  )

})

const loginUser = asyncHandler(async(req, res) => {

  const { username, email, password} = req.body;

  if(!username && !email) {
    throw new ApiError(400, "username or email missing");
  }

  const user = await User.findOne({
    $or: [{username}, {email}]
  })

  if(!user) {
    throw new ApiError(404, "user not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if(!isPasswordValid){
    throw new ApiError(401, "Invalid user credentias");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
  
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res.status(200)
  .cookie("accessToken", accessToken, options)
  .cookie("refreshToken", refreshToken, options)
  .json(
    new ApiResponse(
      200,
      {
        user: loggedInUser, accessToken, refreshToken
      },
      "User logged In Successfully"
    )
  )
})

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
       new: true,
      
    }
  )

  const options = {
  httpOnly: true,
  secure: true,
}

return res.status(200).clearCookie("accessToken", options)
.clearCookie("refreshToken", options)
.json( new ApiResponse(200, {}, "user Logged Out"))

})

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

  if(! incomingRefreshToken) {
    throw new ApiError(401, "unauthorised request");
  }

  const decodedToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
  )

  const user = User.findById(decodedToken?._id)

  if(! user) {
    throw new ApiError(401, "unauthorised request")
  }

  if(incomingRefreshToken !== user?.refreshAccessToken){
    throw new ApiError(401, "refresh token is expired or used")
  }

  const options = {
    httpOnly: true,
    secure: true,
  }

  const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id);

  return res
  .status(200)
  .cookie("accessToken", accessToken, options)
  .cookie("refreshToken", newRefreshToken, options)
  .josn(
    new ApiResponse(
      200,
      {accessToken, refreshToken: newRefreshToken},
      "Access Token refreshed successfully"
    )
  )

})




export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
}