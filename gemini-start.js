import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load the environment variables
dotenv.config();
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

async function start() {
    const model = genAI.getGenerativeModel({model:"gemini-pro"});
    //write me a prompt variable that can prompt my model to output a json format output that produce the itenary of a japan trip
    const prompt = "Write me an itinerary for a 4 days trip to Japan and output it in JSON format, including the picture of places to visit in jpg format where i can access it on web, the activities to do, the food to eat, and the hotels to stay.";
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text()
    console.log(text);
}

start();