const fs = require("fs")
const path = require("path")

const usersPath = path.join("/app/", ".data", "users")
const sessionsProfilesPath = path.join(usersPath, "sessions_profiles")

const folderName = "meh"
const placeToMake = path.join(sessionsProfilesPath, folderName)
console.log("placeToMake:", placeToMake)
console.log("Does it exist yet?:", fs.existsSync(placeToMake))

fs.mkdirSync(placeToMake,
  { "recursive": true}
)

console.log("What about now?:", fs.existsSync(placeToMake))
