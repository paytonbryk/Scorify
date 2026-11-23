// Typical use:
// cd to server/scripts
// so that the dataLayerRoot defined below is correct.
// node add_users -e '["blah@meh.com", "meh@blij.co.uk"]'

// Requires
const argv = require('minimist')(process.argv.slice(2))
const fs = require("fs")
const path = require("path")
const execSync = require('child_process').execSync

// Paths/parameters
const dataLayerRoot = path.join('.', '..', '..', '.data')
let myLegitUsers
let eas
if (argv.e){
  eas = JSON.parse(argv.e)
}
else {
  console.log("No email addresses provided. Returning early.")
  return
}

fs.readFile(
  path.join(dataLayerRoot, 'users', 'legit_users.json'),
  {
    "encoding": "utf8"
  },
  function(err, data){
    if (err) throw err
    const myLegitUsers = JSON.parse(data)
    console.log("myLegitUsers:", myLegitUsers)

    eas.forEach(function(ea){
      const relEa = myLegitUsers.find(function(k){
        return k === ea
      })
      console.log("relEa:", relEa)
      if (relEa === undefined){
        console.log("We have a new user!")
        myLegitUsers.push(ea)
      }
      else {
        console.log("Email address " + ea + " already exists in the system.")
      }

        
    })
    // Write new version of legit_users.json
    fs.writeFileSync(
      path.join(dataLayerRoot, 'users', 'legit_users.json'),
      JSON.stringify(
        myLegitUsers, null, 2
      ),
      {
        "flag": "w",
        "encoding": "utf8"
      }
    )
    const res = execSync("refresh", { encoding: 'utf-8' })
    console.log("res:", res)
  }
)
