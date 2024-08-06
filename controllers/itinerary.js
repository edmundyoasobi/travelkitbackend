require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load the environment variables

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

//get a generate itinerary
const fetchItinerary = async (req, res) => {
  try {
    console.log("hi");
    
    const model = genAI.getGenerativeModel({model:"gemini-pro"});
    const prompt = "Write me an itinerary for a 4 days trip to Japan and output it in JSON format, including the picture of places to visit in jpg format where i can access it on web, the activities to do, the food to eat, and the hotels to stay.";
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log(response.text());
    res.status(201).json(response.text());

  } catch (err) {
    return res.status(400).json({ success: false });
  }
};

module.exports = {
  fetchItinerary,
};
