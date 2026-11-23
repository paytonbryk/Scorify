const fs = require("fs")
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

// const ea = "chenyu.gao@york.ac.uk"
// const ea = "tom.collins@york.ac.uk"
const ea = "alessandro.altavilla@york.ac.uk"
let usersPath
if (process.env.DEVMODE === "prod"){
  usersPath = path.join("/mount", "users")
}
else {
  usersPath = path.join(".data", "users")
}
let myUserSessions
let mlk

module.exports = function(fastify, opts, done){
  fastify.get("/csv/magicLink", function (req, rep){
    // Magic link generation
    mlk = uuidv4()
    console.log("mlk:", mlk)

    // Email to first-time user.
    const msgText = "Hi Ale, the one-time link for obtaining a CSV export of network members is:<br>"
    +
    "https://"
    + process.env.PROJECT_DOMAIN
    + ".glitch.me?csv="
    +
    mlk
    +
    "<br><br>Bye!"

    // Setting up the email that will be sent.
    const mailOptions = {
      from: '"' + "CCC Network" + '" ' +
      '<' + process.env.TEST_SENDER + '>', // Sender address
      to: ea, // List of receivers
      subject: 'CSV download link for CCC', // Subject line
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
        "msg": "Link generated and email sent to user."
      })
    })
  })


  fastify.post("/csv/auth", function (req, rep){
    const inMlk = req.body.magicLink
    console.log("inMlk:", inMlk)
    if (inMlk === null){
      rep.code(404).send()
      return
    }

    if (inMlk !== mlk){
      rep.send({
        "msg": "Dodgy magic link!"
      })
      return
    }

    // Reset mlk.
    mlk = undefined
    myUserSessions = JSON.parse(
      fs.readFileSync(
        path.join(usersPath, "user_sessions.json"),
        {
          "encoding": "utf8"
        }
      )
    )

    let userProfiles = Object.keys(myUserSessions).map(function(k){
      // Last login date
      const d = new Date(
        myUserSessions[k]["stampCreate"]
      )
      const arr = d.toDateString().split(" ")

      return {
        "name": myUserSessions[k]["userProfile"]["name"] || "",
        "email": k,
        "lastActive": arr[1] + " " + arr[3],
        "roleDept": myUserSessions[k]["userProfile"]["roleDept"] || "",
        "skills": myUserSessions[k]["userProfile"]["skills"] || "",
        "description": myUserSessions[k]["userProfile"]["description"] || "",
      }
    })
    userProfiles.unshift(
      {
        "name": "Full name",
        "email": "Email address",
        "lastActive": "Last active",
        "roleDept": "Role and/or department",
        "skills": "Skills",
        "description": "Description"
      }
    )
    rep.send({
      "msg": "Authentication successful!",
      "authToken": mlk,
      "userProfiles": userProfiles
    })

  })


  done()
}
