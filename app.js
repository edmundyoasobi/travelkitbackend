const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const multer = require("multer");
const ISO6391 = require("iso-639-1");
const { FunctionDeclarationSchemaType } = require("@google/generative-ai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const speech = require("@google-cloud/speech");
const {uploadData, getFirebaseApp, initializeFirebaseApp, getData, uploadFoodNames, getFoodNames, uploadPreferences, getPreferences} = require("./firebase");


initializeFirebaseApp();

// Imports the Google Cloud client library
const textToSpeech = require("@google-cloud/text-to-speech");
require("dotenv").config();

// Import other required libraries
const fs = require("fs");
const util = require("util");

app.use(cors());
//it takes any json data that comes with a request and parse it into a javascript object and attach it to the request object
app.use(express.json());

const itinerary = require("./routes/itinerary");
const { get } = require("http");
app.use("/api/itinerary", itinerary);



app.get("/testgetData", async (req, res) => {
  const data = await getData("users");
  res.json(data);
}
)


app.post("/foodPreference", async (req, res) => {

  preferences = await getPreferences(req.body.userId);

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `Write me a list of possible food preference/options for diner that might want to add or skip in two different language languageOfDiner in (${req.body.translateToLanguage}) and languageOfWaiter in ${req.body.translateFromLanguage} where the diner ordering ${req.body.foodName}, for food preference , be logical 
                  you can infer based on the user previous preferences ${preferences}  and based on the food
                   Each preference should have an 'id' starting from 1 , a 'preference' string, and a 'selected' boolean (default is false)
                   
                   .
                   Output using this JSON schema: {
                     "type": "array",
                     "items": {
                       "type": "object",
                       "properties": {
                         "id": {
                           "type": "number",
                           "description": "Unique identifier starting from 1"
                         },
                         “preference”: {
                            "type": "object",
                            "properties": {
                         "preferenceInLanguageOfDiner": {
                           "type": "string",
                           "description": "words representing a food preference, such as no spicy, no meat, no seafood, etc. in (${req.body.translateToLanguage})"
                         },
                         "preferenceInLanguageOfWaiter": {
                           "type": "string",
                           "description": "words representing a food preference, such as no spicy, no meat, no seafood, etc. in (${req.body.translateFromLanguage})"
                         }
          }
                         "selected": {
                           "type": "boolean",
                           "description": "Indicates if the preference is selected.",
                           "default": false
                         }
                       },
                       "required": ["id", "preference", "selected"]
                     }
                   }`,
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
    },
  };

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.API_KEY}`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const jsonArrayString = `${response.data.candidates[0].content.parts[0].text}`;
    const preferencesArray = JSON.parse(jsonArrayString);
    res.json(preferencesArray);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating content");
  }
});


const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fieldSize: 2 * 1024 * 1024 },
});

app.post("/fixorder", async (req, res) => {
  const client = new textToSpeech.TextToSpeechClient();
  const genAI = new GoogleGenerativeAI(
    process.env.API_KEY
  );
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          languageOfDiner: {
            type: FunctionDeclarationSchemaType.STRING,
            description: `The sentence to conclude my selection in ${req.body.translateToLanguage}.`,
          },
          languageOfWaiter: {
            type: FunctionDeclarationSchemaType.STRING,
            description: `The sentence to conclude my selection in ${req.body.translateFromLanguage}.`,
          },
          audioOfWaiter: {
            type: FunctionDeclarationSchemaType.STRING,
            description: "Audio content, default is empty",
          },
          audioOfDiner: {
            type: FunctionDeclarationSchemaType.STRING,
            description: "Audio content ,default is empty",
          },
        },
        required: [
          "languageOfDiner",
          "languageOfWaiter",
          "audioOfWaiter",
          "audioOfDiner",
        ],
      },
    },
  });
  const filterString = req.body.order
    .map(
      (order) =>
        `${order.extraInfo} ${
          order.foodname
        } and my selection is ${JSON.stringify(order.options)}`
    )
    .join(", ");
  let prompt = `I have ordered something and waiter asked some follow up question, this is the followed up question with my answer ${filterString} , and this list of ${req.body.menu}, help me to write a sentence to conclude my selection to the waiter in two different language languageOfDiner in (${req.body.translateToLanguage}) and languageOfWaiter in ${req.body.translateFromLanguage}`;
  try {
    let result = await model.generateContent(prompt);
    const recipesArray = JSON.parse(`${result.response.text()}`);

    const fromLanguageCode = ISO6391.getCode(req.body.translateFromLanguage);
    const toLanguageCode = ISO6391.getCode(req.body.translateToLanguage);
    // Construct the request
    const requestFromLanguage = {
      input: { text: recipesArray.languageOfWaiter },
      // Select the language and SS
      voice: { languageCode: fromLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const requestToLanguage = {
      input: { text: recipesArray.languageOfDiner },
      // Select the language and SS
      voice: { languageCode: toLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const [response] = await client.synthesizeSpeech(requestFromLanguage);
    recipesArray.audioOfWaiter = response.audioContent.toString("base64");
    const [responseOfDiner] = await client.synthesizeSpeech(requestToLanguage);
    recipesArray.audioOfDiner = responseOfDiner.audioContent.toString("base64");
    res.json(recipesArray);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating content");
  }
});

app.post("/uploadAudio", upload.single("file"), async (req, res) => {
  console.log(req.body);
  const client = new speech.SpeechClient();
  const genAI = new GoogleGenerativeAI(
    process.env.API_KEY
  );
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const audio = {
    content: req.file.buffer.toString("base64"),
  };
  const fromLanguageCode = ISO6391.getCode(req.body.translateFromLanguage);
  const config = {
    encoding: "MP3", // Change this based on the audio format
    sampleRateHertz: 16000,
    languageCode: fromLanguageCode,
  };

  const request = {
    audio: audio,
    config: config,
  };
  const [response] = await client.recognize(request);
  const transcription = response.results
    .map((result) => result.alternatives[0].transcript)
    .join("\n");

  var prompt = "";
  if (transcription.length > 1) {
  prompt = `Given the following ${transcription} from the waiter and the list of ${JSON.stringify(
    req.body.order
  )}, perform the following tasks:

1. Translate the transcription from the waiter to ${
    req.body.translateToLanguage
  }.
2. Determine if the waiter needs extra info from us or if we need to modify our order and the meal mentioned by th waiter is in our order. This should be a boolean value: true if modification or extra info is needed (e.g., if the waiter mentions an item is unavailable), and false otherwise (e.g., if the waiter says "thank you" or "no problem" ) or the meal the waiter mentioned not in our orders (e.g. waiter say we about fried rice but we didn't order fried rice return false).
3. If the waiter needs us to provide extra info or modify our order, list the foodid from the orders that need modification or extra and the reasons for the modification/ extra info. Beside provide and array of options for diner to choose from based on what is needed by the waiter. the options should be in the language of the diner(${
    req.body.translateToLanguage
  }) and the waiter (${req.body.translateFromLanguage}).
 with this json schema 
 {
"originalTranscription": ${transcription},
  "translatedTranscription": "string",
  "audioOfWaiter": {
      "type": "string",
      "description": "Audio content",
      "default": ""
    }
      "audioOfDiner": {
      "type": "string",
      "description": "Audio content",
      "default": ""
    }
  "modifyOrderorExtraInfoNeeded": "boolean",
  "modificationsOrExtraInfo": [
    {
      "foodid": "integer",
      "reason": "string",
      "modificationOptionsForDiner": [
    {
      "selected": "boolean" (false by default),
      "optionindinerlanguage": "string",
      "optioninwaiterlanguage": "string
    }
  ]

    }
  ]
  
} `;
} else {
  prompt = `Ask user to try speak again , make it in two different languages :  ${req.body.translateFromLanguage} (Fill it in originalTranscription) and ${req.body.translateToLanguage} (Fill it in translatedTranscription).
  with this json schema 
{
"originalTranscription": "string",
"translatedTranscription": "string",
"audioOfWaiter": {
    "type": "string",
    "description": "Audio content",
    "default": ""
  }
    "audioOfDiner": {
    "type": "string",
    "description": "Audio content",
    "default": ""
  },
  
}`;
}
  try {
    let result = await model.generateContent(prompt);
    const textToSpeechClient = new textToSpeech.TextToSpeechClient();
    const recipesArray = JSON.parse(`${result.response.text()}`);
    const fromLanguageCode = ISO6391.getCode(req.body.translateFromLanguage);
    const toLanguageCode = ISO6391.getCode(req.body.translateToLanguage);
    // Construct the request
    const requestFromLanguage = {
      input: { text: recipesArray.originalTranscription },
      // Select the language and SS
      voice: { languageCode: fromLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const requestToLanguage = {
      input: { text: recipesArray.translatedTranscription },
      // Select the language and SS
      voice: { languageCode: toLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const [responseOfWaiter] = await textToSpeechClient.synthesizeSpeech(
      requestFromLanguage
    );
    recipesArray.audioOfWaiter =
      responseOfWaiter.audioContent.toString("base64");
    const [responseOfDiner] = await textToSpeechClient.synthesizeSpeech(
      requestToLanguage
    );
    recipesArray.audioOfDiner = responseOfDiner.audioContent.toString("base64");
    console.log(recipesArray);
    res.json(recipesArray);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating content");
  }

  /*
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  console.log(req.file);
  */
});

app.post("/uploadDinerAudio", upload.single("file"), async (req, res) => {
  console.log(req.body);
  const client = new speech.SpeechClient();
  const genAI = new GoogleGenerativeAI(
    process.env.API_KEY
  );
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const audio = {
    content: req.file.buffer.toString("base64"),
  };
  const toLanguageCode = ISO6391.getCode(req.body.translateToLanguage);
  const config = {
    encoding: "MP3", // Change this based on the audio format
    sampleRateHertz: 16000,
    languageCode: toLanguageCode,
  };

  const request = {
    audio: audio,
    config: config,
  };
  const [response] = await client.recognize(request);

  const transcription = response.results

    .map((result) => result.alternatives[0].transcript)
    .join("\n");
  console.log("transcription", transcription.length);
  var prompt = "";
  if (transcription.length > 1) {
    prompt = `Given the following : ${transcription} (Fill it in originalTranscription) Translate it to ${req.body.translateFromLanguage} (Fill it in translatedTranscription).

 with this json schema 
 {
"originalTranscription": ${transcription},
  "translatedTranscription": "string",
  "audioOfWaiter": {
      "type": "string",
      "description": "Audio content",
      "default": ""
    }
      "audioOfDiner": {
      "type": "string",
      "description": "Audio content",
      "default": ""
    }
} `;
  } else {
    prompt = `Ask user to try speak again , make it in two different languages :  ${req.body.translateFromLanguage} (Fill it in translatedTranscription) and ${req.body.translateToLanguage} (Fill it in originalTranscription).
    with this json schema 
 {
"originalTranscription": ${transcription},
  "translatedTranscription": "string",
  "audioOfWaiter": {
      "type": "string",
      "description": "Audio content",
      "default": ""
    }
      "audioOfDiner": {
      "type": "string",
      "description": "Audio content",
      "default": ""
    }
}`;
  }
  try {
    let result = await model.generateContent(prompt);
    const textToSpeechClient = new textToSpeech.TextToSpeechClient();
    const recipesArray = JSON.parse(`${result.response.text()}`);
    const fromLanguageCode = ISO6391.getCode(req.body.translateFromLanguage);
    const toLanguageCode = ISO6391.getCode(req.body.translateToLanguage);
    // Construct the request
    const requestFromLanguage = {
      input: { text: recipesArray.translatedTranscription },
      // Select the language and SS
      voice: { languageCode: fromLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const requestToLanguage = {
      input: { text: recipesArray.originalTranscription },
      // Select the language and SS
      voice: { languageCode: toLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const [responseOfWaiter] = await textToSpeechClient.synthesizeSpeech(
      requestFromLanguage
    );
    recipesArray.audioOfWaiter =
      responseOfWaiter.audioContent.toString("base64");
    const [responseOfDiner] = await textToSpeechClient.synthesizeSpeech(
      requestToLanguage
    );
    recipesArray.audioOfDiner = responseOfDiner.audioContent.toString("base64");

    res.json(recipesArray);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating content");
  }

  /*
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  console.log(req.file);
  */
});

app.post("/editText", async (req, res) => {
  // Creates a client
  const client = new textToSpeech.TextToSpeechClient();
  const genAI = new GoogleGenerativeAI(
    process.env.API_KEY
  );

  console.log(req.body);

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          translateToText: {
            type: FunctionDeclarationSchemaType.STRING,
            description: ` ${req.body.text} in ${req.body.translateToLanguage}.`,
          },
          audioOfOriginalText: {
            type: FunctionDeclarationSchemaType.STRING,
            description: "default is empty",
          },
          audioOfTranslatedText: {
            type: FunctionDeclarationSchemaType.STRING,
            description: "default is empty",
          },
        },
        required: [
          "translateToText",
          "audioOfOriginalText",
          "audioOfTranslatedText",
        ],
      },
    },
  });
  let prompt = `Translate the sentence (${req.body.text}) `;
  try {
    let result = await model.generateContent(prompt);
    const editTextResponse = JSON.parse(`${result.response.text()}`);
    console.log(editTextResponse);
    const fromLanguageCode = ISO6391.getCode(req.body.translateFromLanguage);
    const toLanguageCode = ISO6391.getCode(req.body.translateToLanguage);
    // Construct the request
    const requestFromLanguage = {
      input: { text: req.body.text },
      // Select the language and SS
      voice: { languageCode: fromLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const requestToLanguage = {
      input: { text: editTextResponse.translateToText },
      // Select the language and SS
      voice: { languageCode: toLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const [response] = await client.synthesizeSpeech(requestFromLanguage);
    editTextResponse.audioOfOriginalText =
      response.audioContent.toString("base64");
    const [responseOfTranslatedAudio] = await client.synthesizeSpeech(
      requestToLanguage
    );
    editTextResponse.audioOfTranslatedText =
      responseOfTranslatedAudio.audioContent.toString("base64");
    res.json(editTextResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating content");
  }
});


app.post("/textToSpeech", async (req, res) => {
  // Creates a client
  const client = new textToSpeech.TextToSpeechClient();
  const genAI = new GoogleGenerativeAI(
    process.env.API_KEY
  );

  const foodString = req.body.order
    .map(
      (food) =>
        `${food.foodname} (${food.translatedFoodName}) quantity ${
          food.quantity
        } preferences ${JSON.stringify(food.preferences)}`
    )
    .join(", ");

  uploadFoodNames(req.body.userId,req.body.order);
  uploadPreferences(req.body.userId,req.body.order);


  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
          languageOfDiner: {
            type: FunctionDeclarationSchemaType.STRING,
            description: `The sentence to order the food from the orders in ${req.body.translateToLanguage}. Use translatedFoodName in the order list as reference`,
          },
          languageOfWaiter: {
            type: FunctionDeclarationSchemaType.STRING,
            description: `The sentence to order the food from the orders in ${req.body.translateFromLanguage}.`,
          },
          audioOfWaiter: {
            type: FunctionDeclarationSchemaType.STRING,
            description: "Audio content of the waiter ,default is empty",
          },
          audioOfDiner: {
            type: FunctionDeclarationSchemaType.STRING,
            description: "Audio content of the diner ,default is empty",
          },
        },
        required: [
          "languageOfDiner",
          "languageOfWaiter",
          "audioOfWaiter",
          "audioOfDiner",
        ],
      },
    },
  });
  let prompt = `Write me the sentences to order for diner in ${
    req.body.translateToLanguage
  } and to waiter in ${req.body.translateFromLanguage} ,  ${JSON.stringify(
    req.body.order
  )} is the list of foods i want to order remember to be polite`;
  try {
    let result = await model.generateContent(prompt);
    const recipesArray = JSON.parse(`${result.response.text()}`);

    const fromLanguageCode = ISO6391.getCode(req.body.translateFromLanguage);
    const toLanguageCode = ISO6391.getCode(req.body.translateToLanguage);
    // Construct the request
    const requestFromLanguage = {
      input: { text: recipesArray.languageOfWaiter },
      // Select the language and SS
      voice: { languageCode: fromLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const requestToLanguage = {
      input: { text: recipesArray.languageOfDiner },
      // Select the language and SS
      voice: { languageCode: toLanguageCode, ssmlGender: "NEUTRAL" },
      // Select the type of audio encoding
      audioConfig: { audioEncoding: "MP3" },
    };
    const [response] = await client.synthesizeSpeech(requestFromLanguage);
    recipesArray.audioOfWaiter = response.audioContent.toString("base64");
    const [responseOfDiner] = await client.synthesizeSpeech(requestToLanguage);
    recipesArray.audioOfDiner = responseOfDiner.audioContent.toString("base64");
    res.json(recipesArray);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating content");
  }
});

app.post("/uploadImage", upload.single("file"), async (req, res) => {
  const genAI = new GoogleGenerativeAI(
    process.env.API_KEY
  );
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  foodName = await getFoodNames(req.body.userId);
  console.log(foodName);
  const response = await axios.get(
    `https://v6.exchangerate-api.com/v6/${process.env.CURRENCY_API_KEY}/latest/${req.body.convertTo}`
  );

  const exchangeRate = response.data.conversion_rates[req.body.convertFrom];
  console.log(exchangeRate);



  // Print the response.
  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/png",
          data: req.file.buffer.toString("base64"),
        },
      },
      {
        text: `Given the image first identify if the image is a menu , 
        then convert the food's name from ${req.body.translateFromLanguage} to ${req.body.translateToLanguage}, 
        the generated food description should also be in ${req.body.translateToLanguage} using the provided 
        Json schema .convert the price from ${req.body.convertFrom} to ${req.body.convertTo} where the current exchange rate is 1 ${req.body.convertTo} = ${exchangeRate} ${req.body.convertFrom} 
        beside based on user order history see if the food is recommended , user history : ${foodName}, you can infer if this is recommended based on what the food is made of, not just the name for example user ordered food related to chicken , you can recommend chicken dishes.,
        "type": "object",
  "properties": {
    "isFoodMenu": {
      "type": "boolean",
      "description": "Indicates whether this is a food menu. "
    },
    "foods": {
      "type": "array",
      "description": "A list of foods on the menu.",
      "items": {
        "type": "object",
        "properties": {
          "recommended": {
            "type": "boolean",
            "description": "based on user order history see if the food is recommended , user history : ${foodName} you can infer if this is recommended based on what the food is made of, not just the name for example user ordered food related to chicken , you can recommend chicken dishes." 
          },
          "id": {
            "type": "number",
            "description": "Unique identifier starting from 1"
          },
          "originalName": {
            "type": "string",
            "description": "The original name of the food on the menu. "
          },
          "translatedName": {
            "type": "string",
            "description": "The translated name of the food."
          },
           "originalPrice": {
            "type": "number",
            "description": "The price of the food before conversion."
          },
          "priceAfterConversion": {
            "type": "number",
            "description": "The price of the food after conversion."
          },
            "quantity": {
            "type": "number",
            "description": "just provide a 0 to it"
          },
            "description": {
            "type": "string",
            "description": "give a brief description of the food in ${req.body.translateToLanguage}, eg how it fits to the culture , the ingredients. "
          }
        },
        "required": ["originalName", "translatedName", "price"]
      }
    },
    "otherinfo": {
      "type": "object",
      "description": "Other information on the menu. "
      "properties": {
      "originalLanguage": {
            "type": "string",
            "description": "other info in the original language on the menu."
          },
          "translatedLanguage": {
            "type": "string",
            "description": "other info in the translated language on the menu."
      }
    }
  },
  "required": ["isFoodMenu", "foods", "otherinfo"]
}`,
      },
    ]);
    const recipesArray = JSON.parse(`${result.response.text()}`);
    res.json(recipesArray);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating content");
  }
});

app.post(
  "/inferLanguageAndCurrency",
  upload.single("file"),
  async (req, res) => {
    const genAI = new GoogleGenerativeAI(
      process.env.API_KEY
    );
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            isFoodMenu: {
              type: FunctionDeclarationSchemaType.BOOLEAN,
              description:
                "Returns true if the image is a food menu else false",
            },
            currencyCode: {
              type: FunctionDeclarationSchemaType.STRING,
              description: "The currency code (e.g., USD, EUR, MYR). 3 alpha",
            },
            isoCode: {
              type: FunctionDeclarationSchemaType.STRING,
              description: "The ISO code (e.g., US, DE). 2 alpha",
            },
            language: {
              type: FunctionDeclarationSchemaType.STRING,
              description:
                "The language of the Menu (e.g., Japanese, English).",
            },
            languageCode: {
              type: FunctionDeclarationSchemaType.STRING,
              description:
                "The language code (2 alpha) of the Menu (e.g., ja, en).",
            },
          },
          required: ["currencyCode", "isoCode", "language", "languageCode"],
        },
      },
    });
    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "image/png",
            data: req.file.buffer.toString("base64"),
          },
        },
        {
          text: `Given the image infer the language of the menu (fill in the language property in the return json) and infer the currency  (fill in the currencyCode (in 3 alpha not the symbol) and isoCode property in the return json), if the menu not showing currency, infer it based on the language output using the provided Json schema .`,
        },
      ]);
      // Print the response.
      const recipesArray = await result.response.text();
      const parsedRecipes = JSON.parse(`${recipesArray}`);

      res.json(parsedRecipes);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error generating content");
    }
  }
);

const start = async () => {
  app.listen(4999, () => {
    console.log("server");
  });
};

start();
