const fs = require("fs")
const path = require("path")

const usersPath = path.join("/app/", ".data", "users")
const sessionsProfilesPath = path.join(usersPath, "sessions_profiles")

const placeToRead = path.join(sessionsProfilesPath)
console.log("placeToRead:", placeToRead)

fs.readdirSync(placeToRead).forEach(function(nam){
  console.log("nam:", nam)
})

// console.log("What about now?:", fs.existsSync(placeToMake))