const fs = require("fs")
const path = require("path")
require('dotenv').config()
const nodemailer = require("nodemailer")
// Create reusable transporter object using the default SMTP transport.
const transporter = nodemailer.createTransport({
  "service": "gmail",
  "auth": {
    "user": process.env.SMTP_LOGIN,
    "pass": process.env.SMTP_PASSW
  }
})
const { "v4": uuidv4 } = require("uuid")
const mu = require("maia-util")

console.log("mode:", process.env.DEVMODE)

let currTokens, sthg
const sessionLength = 90*24*60*60*1000 // of 90 days
const activeCutoff = 365*24*60*60*1000 // of 365 days
// const nosActive = 10 // Number of active users to show on landing page

// Paths to various data files
let usersPath
if (process.env.DEVMODE === "prod"){
  usersPath = path.join("/mount", "users")
}
else {
  usersPath = path.join(".data", "users")
}
const legitUsersPath = path.join(usersPath, "legit_users.json")
const sessionsProfilesPath = path.join(usersPath, "sessions_profiles")

// const outsideEAddr = [
//   "tomthecollins@gmail.com",

// ]

// Load the legit users onto keys of an object.
const legitUsers = {}
JSON.parse(
  fs.readFileSync(
    legitUsersPath,
    {
      "encoding": "utf8"
    }
  )
).forEach(function(ea){
  legitUsers[ea] = null
})
console.log("Object.keys(legitUsers).length:", Object.keys(legitUsers).length)
console.log("legitUsers:", legitUsers)

// All the users' data, gathered from various folders on the back-end into one object.
const allUserData = get_all_user_data()
// console.log("allUserData:", allUserData)


module.exports = {

  authRouteHandler: function(fastify, opts, done){

    // Generates an authentication token and sends email to user.
    fastify.post("/api/authToken", function(req, rep){
      // Grab user email from the req.body.
      const ea = req.body.emailAddr
      console.log("ea:", ea)
      if (
        ea === null || // No email supplied
        legitUsers[ea] === undefined // Not a legit user
      ){
        rep.send({
          "msg": "Not a registered email."
        })
        return
      }

      console.log("HERE in authToken")
      // Token generation
      const tkn = alphanumeric_token_generator(3)
      console.log("tkn:", tkn)
      let msgText


      if (allUserData[ea] === undefined){
        console.log("We have a new user!")
        const currId = uuidv4()
        const currIdShort = currId.slice(0, 3)


        if (!fs.existsSync(path.join(sessionsProfilesPath, currIdShort, currId))){
          console.log("Doesn't exist!")
          fs.mkdirSync(path.join(sessionsProfilesPath, currIdShort, currId),
            { "recursive": true}
          )
          console.log("Does it exist now?:", fs.existsSync(path.join(sessionsProfilesPath, currIdShort, currId)))
        }


        const currDate = Date.now()
        const entry = {
          "id": currId,
          "email": ea,
          "authToken": tkn,
          "stampCreate": currDate,
          "userProfile": {
            "name": null,
            "imageLink": null,
            "roleDept": null,
            "skills": null,
            "description": null,
            "uploads": [],
            "visits": [currDate]
          }
        }
        allUserData[ea] = entry

        // Write new version of user's data.
        fs.writeFileSync(
          path.join(sessionsProfilesPath, currIdShort, currId, "index.json"),
          JSON.stringify(
            entry, null, 2
          ),
          {
            "flag": "w",
            "encoding": "utf8"
          }
        )

        // Email to first-time user.
        msgText = "Hello, welcome to TSMLP. Here is your authentication token:<br>"
        +
        // "https://"
        // + process.env.PROJECT_DOMAIN
        // + ".glitch.me?mlk="
        // +
        tkn
        +
        "<br><br>You can paste this token into the next textbox on TSMLP, or if you're feeling smart, to reuse this authentication token for the next 90 days, just add<br>"
        +
        "tsmlp.glitch.me/?tkn=" + tkn
        +
        "<br>to your bookmarks."
        +
        "<br><br>Kind regards,"
        +
        "<br>T. Collins"
      }
      else {
        console.log("We have a returning user!")
        const currId = allUserData[ea]["id"]
        const currIdShort = currId.slice(0, 3)
        allUserData[ea]["authToken"] = tkn
        allUserData[ea]["stampCreate"] = Date.now()
        allUserData[ea]["userProfile"]["visits"].push(allUserData[ea]["stampCreate"])

        // Write new version of user's data.
        fs.writeFileSync(
          path.join(sessionsProfilesPath, currIdShort, currId, "index.json"),
          JSON.stringify(
            // NEEDS ATTENTION:
            allUserData[ea], null, 2
          ),
          {
            "flag": "w",
            "encoding": "utf8"
          }
        )

        // Email to returning user.
        msgText = msgText = "Hello, welcome back to the TSMLP site. Here is your authentication token:<br>"
        +
        // "https://"
        // + process.env.PROJECT_DOMAIN
        // + ".glitch.me?mlk="
        // +
        tkn
        +
        "<br><br>You can paste this token into the next textbox on TSMLP, or if you're feeling smart, to reuse this authentication token for the next 90 days, just add<br>"
        +
        "tsmlp.glitch.me/?tkn=" + tkn
        +
        "<br>to your bookmarks."
        +
        "<br><br>Kind regards,"
        +
        "<br>T. Collins"
      }

      // Setting up the email that will be sent.
      const mailOptions = {
        from: '"' + "TSMLP" + '" ' +
        '<' + process.env.TEST_SENDER + '>', // Sender address
        to: ea, // List of receivers
        subject: 'Access link for the TSMLP site', // Subject line
        text: msgText, // Plaintext body
        html: msgText // HTML body
      }

      // Sending that email.
      transporter.sendMail(mailOptions, function(error, info){
        if(error){
          return console.log(error)
        }
        console.log('Message sent: ' + info.response)

        rep.send({
          "msg": "Link generated and email sent to user.",
          "emailAddr": ea
        })
      })


    })


    // Checks whether the entered authentication token is legit.
    fastify.post("/api/checkToken", function(req, rep){
      const ea = req.body.emailAddr
      const tkn = req.body.authToken
      console.log("Hello from checkToken:", ea, tkn)
      if (tkn === null){
        rep.code(404).send()
        return
      }

      // sthg = JSON.parse(
      //   fs.readFileSync(
      //     sthgPath,
      //     {
      //       "encoding": "utf8"
      //     }
      //   )
      // )
      // console.log("sthg:", sthg)

      if (allUserData[ea]["authToken"] !== tkn){
        rep.send({
          "msg": "Dodgy token!"
        })
        return
      }

      // See if current date minus stampCreate property is less than some arbitrary threshold.
      if (Date.now() - allUserData[ea]["stampCreate"] > sessionLength){
        // Session expired.
        rep.send({
          "msg": "Session expired!"
        })
      }
      else {
        // Session in date.

        // LOAD A USER'S DOCS HERE, AND SEND THEM DOWN AS A PROPERTY OF THE OBJECT.

        rep.send({
          "msg": "Authentication successful!",
          "emailAddr": ea,
          "authToken": allUserData[ea]["authToken"],
          "userProfile": allUserData[ea]["userProfile"],
          // "tools": sthg
          // "activeUsers": cleanActiveUsers
        })
      }

    })


    // Runs when the page loads and fast-tracks authentication if someone has provided a legit token in the URL.
    fastify.post("/api/auth", function(req, rep){
      const tkn = req.body.authToken
      console.log("tkn:", tkn)
      if (tkn === null){
        rep.code(404).send()
        return
      }

      // sthg = JSON.parse(
      //   fs.readFileSync(
      //     sthgPath,
      //     {
      //       "encoding": "utf8"
      //     }
      //   )
      // )
      // console.log("sthg:", sthg)

      const ea = Object.keys(allUserData)
        .find(function(k){
          return allUserData[k]["authToken"] === tkn
        }
      )
      console.log("ea:", ea)
      if (ea === undefined){
        rep.send({
          "msg": "Dodgy token!"
        })
        return
      }

      // See if current date minus stampCreate property is less than some arbitrary threshold.
      if (Date.now() - allUserData[ea]["stampCreate"] > sessionLength){
        // Session expired.
        rep.send({
          "msg": "Session expired!"
        })
      }
      else {
        // Session in date.

        // LOAD A USER'S DOCS HERE, AND SEND THEM DOWN AS A PROPERTY OF THE OBJECT.

        rep.send({
          "msg": "Authentication successful!",
          "emailAddr": ea,
          "authToken": allUserData[ea]["authToken"],
          "userProfile": allUserData[ea]["userProfile"],
          // "tools": sthg
          // "activeUsers": cleanActiveUsers
        })
      }

    })


    fastify.post("/api/updateConsent", function(req, rep){
      const ea = req.body.emailAddr
      const tkn = req.body.authToken
      const ic = req.body.idConsent
      const tf = req.body.tf
      console.log("ea:", ea)
      console.log("tkn:", tkn)
      console.log("ic:", ic)
      console.log("tf:", tf)
      if (tkn === null){
        rep.code(404).send()
        return
      }


      const currId = allUserData[ea]["id"]
      const currIdShort = currId.slice(0, 3)

      if (allUserData[ea]["authToken"] !== tkn){
        rep.send({
          "msg": "Dodgy token!"
        })
        return
      }

      // See if current date minus stampCreate property is less than some arbitrary threshold.
      if (Date.now() - allUserData[ea]["stampCreate"] > sessionLength){
        // Session expired.
        rep.send({
          "msg": "Session expired!"
        })
      }
      else {
        console.log("Got here!")
        console.log('allUserData[ea]["userProfile"]["consents"]:', allUserData[ea]["userProfile"]["consents"])
        allUserData[ea]["userProfile"]["consents"][ic] = tf
        console.log('allUserData[ea]["userProfile"]:', allUserData[ea]["userProfile"])

        const currIdShort = allUserData[ea].id.slice(0, 3)
        const currId = allUserData[ea].id

        // Write new version of user's data.
        fs.writeFileSync(
          path.join(sessionsProfilesPath, currIdShort, currId, "index.json"),
          JSON.stringify(
            allUserData[ea], null, 2
          ),
          {
            "flag": "w",
            "encoding": "utf8"
          }
        )

        rep.send({
          "msg": "Update successful!"
        })
      }



    })


    fastify.get("/api/sunoAll", function(req, rep){
      const incomingAuthKey = req.query.authKey
      // const incomingAuthKey = req.body.authKey
      if (
        incomingAuthKey === undefined ||
        incomingAuthKey !== process.env.SUNO_AUTH_KEY
      ){
        rep.code(404).send()
        return
      }

      const consentingUsers = Object.keys(allUserData)
      .filter(function(k){
        return allUserData[k]["userProfile"]["consents"]["suno"]
      })
      // console.log("consentingUsers:", consentingUsers)

      rep.send({
        "emails": consentingUsers
      })
      return

    })


    fastify.get("/api/sunoOne", function(req, rep){
      const incomingAuthKey = req.query.authKey
      const emailAddr = req.query.email
      console.log("emailAddr:", emailAddr)
      // const incomingAuthKey = req.body.authKey
      if (
        incomingAuthKey === undefined ||
        incomingAuthKey !== process.env.SUNO_AUTH_KEY ||
        emailAddr === undefined
      ){
        rep.code(404).send()
        return
      }

      let legitFrostAndConsented = false
      if (
        allUserData[emailAddr] !== undefined &&
        allUserData[emailAddr]["userProfile"]["consents"]["suno"]
      ){
        legitFrostAndConsented = true
      }
      console.log("legitUserAndConsented:", legitFrostAndConsented)

      rep.send({
        "legitFrostAndConsented": legitFrostAndConsented
      })
      return

    })


    fastify.post("/sendEmail", function(req, rep) {
      console.log("Hello, I was triggered!")
      console.log("req.body:", req.body)
      const ea = req.body.emailAddress
      if (ea === null){
        rep.code(404).send()
        return
      }
      const msgText = "Hello, this is a test email.<br><br>Bye!"

      const mailOptions = {
        from: '"' + "SoVoT Network" + '" ' +
        '<' + process.env.TEST_SENDER + '>',
        to: ea,
        subject: 'Test Mail',
        text: msgText,
        html: msgText
      }

      transporter.sendMail(mailOptions, function(error, info){
        if(error){
          return console.log(error)
        }
        console.log('Message sent: ' + info.response)
        rep.send({
          "hello": "blah blah"
        })
      })
    })


    done()

  },

  allUserData
}


function get_all_user_data(){
  const info = {}
  fs.readdirSync(sessionsProfilesPath).forEach(function(shortDir){
    // console.log("shortDir:", shortDir)
    fs.readdirSync(
      path.join(sessionsProfilesPath, shortDir)
    ).forEach(function(longDir){
      // console.log("longDir:", longDir)
      const userPath = path.join(sessionsProfilesPath, shortDir, longDir, "index.json")
      // console.log("fs.existsSync():", fs.existsSync(userPath))
      if (fs.existsSync(userPath)){
        try {
          const userData = JSON.parse(
            fs.readFileSync(
              userPath,
              { "encoding": "utf8" }
            )
          )
          // console.log("userData:", userData)
          info[userData["email"]] = userData
        }
        catch (err){
          console.log("err:", err)
          console.log("User id affected:", longDir)
        }
      }
    })
  })
  return info
}



// Two utility functions from MAIA Util/Mozilla
function sample_without_replacement(arr, sampleSize){
  const n = arr.length;
  if (n > 0){
    if (n >= sampleSize){
      const idxUnchosen = new Array(n);
      for (let i = 0; i < n; i++){
        idxUnchosen[i] = i;
      }
      // console.log("idxUnchosen:", idxUnchosen);
      const idxChosen = [];
      while (idxChosen.length < sampleSize){
        // Choose one of the idxUnchosen.
        const idxChoice = get_random_int(0, idxUnchosen.length);
        // console.log("idxChoice:", idxChoice);
        // Add it to idxChosen.
        idxChosen.push(idxUnchosen[idxChoice]);
        // console.log("idxChosen:", idxChosen);
        // Remove it from idxUnchosen.
        idxUnchosen.splice(idxChoice, 1);
        // console.log("idxUnchosen:", idxUnchosen);
      }
      return idxChosen.map(function(idx){
        return arr[idx]
      })
    }
  }
}


function get_random_int(min, max){
  return Math.floor(Math.random() * (max - min)) + min;
}


function token_generator(arrOfWordArrs){
  return arrOfWordArrs.map(function(arrOfWords, idx){
    const len = arrOfWords.length
    const randIdx = Math.floor(len*Math.random())
    return arrOfWords[randIdx]
  })
  .join("-")
}


function alphanumeric_token_generator(len){
  return mu.rand_alphanumeric(len)
}
