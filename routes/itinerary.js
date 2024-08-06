const express = require('express')
const router = express.Router()
const {fetchItinerary} = require('../controllers/itinerary')

router.get('/', fetchItinerary)

module.exports = router