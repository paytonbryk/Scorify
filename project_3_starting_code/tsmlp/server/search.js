// Supporting search and updateProfile
const si = require('search-index')
let db, tmpSearchPath
if (process.env.DEVMODE === "prod"){
  tmpSearchPath = path.join("/mount", "TMP-SEARCH")
}
else {
  tmpSearchPath = path.join(".data", "TMP-SEARCH")
}
si({ name: tmpSearchPath }).then(function(ans){
  db = ans
})

// Supporting updateProfile
const fs = require("fs")
let myUserSessions


module.exports = function(fastify, opts, done){
  fastify.post("/api/search", async function (req, rep){
    // Grab auth token and keywordsfrom the req.body.
    const authToken = req.body.authToken
    const kw = req.body.keywords
    if (authToken === null || kw === null){
      rep.code(404).send()
      return
    }
    // Could extend/improve the above code to check that it's a valid auth token, rather than just present. It would slow down the return of search results a bit though.

    // Need this to obtain their last active property.
    myUserSessions = JSON.parse(
      fs.readFileSync(
        "./.data/user_sessions.json",
        {
          "encoding": "utf8"
        }
      )
    )

    await db.SEARCH(kw)
    .then(async function(sr){
      // console.log("sr:", sr)

        if (sr["RESULT_LENGTH"] === 0){
          rep.send({
            "message": "No relevant results"
          })
        }
        else {
          const ids = sr["RESULT"].map(function(r){
            return r["_id"]
          })
          console.log("ids:", ids)
          const scores = sr["RESULT"].map(function(r){
            return r["_score"]
          })
          const docs = await db.DOCUMENTS(...ids)
          .then(function(docs){

            console.log("docs:", docs)
            // Strip off _id and any other fields we don't need/want to send down, and add the image link, relevance score, and last active fields.
            docs.forEach(function(doc, idx){
              delete doc["_id"]
              // Image link
              doc["imageLink"] = myUserSessions[
                doc["email"]
              ]["userProfile"]["imageLink"]
              // Relevance score
              doc["score"] = scores[idx]
              // Last active
              const d = new Date(
                myUserSessions[doc["email"]]["stampCreate"]
              )
              const arr = d.toDateString().split(" ")
              doc["lastActive"] = arr[1] + " " + arr[3]
            })

            rep.send({
              "message": "Relevant results",
              "entries": docs
            })

          }) // Second then()
        }

    }) // First then()
  })


  fastify.post("/api/updateProfile", async function (req, rep){
    // Grab auth token and keywordsfrom the req.body.
    const authToken = req.body.authToken
    const usrName = req.body.usrName
    const usrImageLink = req.body.usrImageLink
    const usrRoleDept = req.body.usrRoleDept
    const usrSkills = req.body.usrSkills
    const usrDescription = req.body.usrDescription
    if (authToken === null){
      rep.code(404).send()
      return
    }
    // Could extend/improve the above code to check that it's a valid auth token, rather than just present. It would slow down the return of search results a bit though.

    myUserSessions = JSON.parse(
      fs.readFileSync(
        "./.data/user_sessions.json",
        {
          "encoding": "utf8"
        }
      )
    )
    const ea = Object.keys(myUserSessions)
    .find(function(k){
        return myUserSessions[k]["magicLink"] === authToken

      }
    )
    console.log("ea:", ea)
    const relUsr = myUserSessions[ea]
    relUsr["userProfile"]["name"] = usrName
    relUsr["userProfile"]["imageLink"] = usrImageLink
    relUsr["userProfile"]["roleDept"] = usrRoleDept
    relUsr["userProfile"]["skills"] = usrSkills
    relUsr["userProfile"]["description"] = usrDescription

    // Write new version of user_sessions.json
    fs.writeFileSync(
      "./.data/user_sessions.json",
      JSON.stringify(
        myUserSessions, null, 2
      ),
      {
        "flag": "w",
        "encoding": "utf8"
      }
    )

    try {


      await db.DOCUMENTS("8d37fa3d-ff7e-4947-94cf-0182f1779439")
      .then(function(docs){ console.log("docs before DELETE:", docs) })

      await db.DELETE(relUsr["id"])
      await db.PUT(
        [
          {
            "_id": relUsr["id"],
            "name": relUsr["userProfile"]["name"],
            "email": ea,
            "roleDept": relUsr["userProfile"]["roleDept"],
            "skills": relUsr["userProfile"]["skills"],
            "description": relUsr["userProfile"]["description"]
          }
        ]
      )

      // DELETE was not working as I would expect. See issue here:
      // https://github.com/fergiemcdowall/search-index/issues/514
      // so a(n inefficient) workaround using FLUSH and PUT is:

      // await db.FLUSH()
      // await db.PUT(
      //   Object.keys(myUserSessions).map(function(k, idx){
      //     return {
      //       "_id": myUserSessions[k].id,
      //       "name": myUserSessions[k].userProfile.name,
      //       "email": k,
      //       "roleDept": myUserSessions[k].userProfile.roleDept,
      //       "skills": myUserSessions[k].userProfile.skills,
      //       "description": myUserSessions[k].userProfile.description
      //     }
      //   })
      // )


      await db.DOCUMENTS("8d37fa3d-ff7e-4947-94cf-0182f1779439")
      .then(function(docs){ console.log("docs after DELETE:", docs) })


      rep.send({
        "message": "Profile updated successfully.",
        // "details": details
      })
    }
    catch (err){
      rep.send({
        "message": "Profile update failed.",
        "err": err
      })
    }







  })


  done()
}
