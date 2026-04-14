import { config } from 'dotenv';
await config({ path: '.env' });
import connectDB from "./db/index.js";

connectDB()
.then(() => {
  application.listen(process.env.PORT || 8000, () => {
    console.log(`Server is running at port : ${process.env.PORT}`);
  })
})
.catch((error) => {
  console.log("MongoDB connection failed !!! ", error);
})
