// Typical use:
// node add_event.js -e '{...}' -d 2020.10.09.II

// node add_event -e '{ "date": "2023.06.16", "presenters": "Kyle Worrall", "idPresenters": ["kworrall"], "title": "Game audio in Unreal Engine 4: Part II (on music)", "recording": "https://drive.google.com/file/d/1Wone8Y2yeWalvStL5SENHLjmByXa-F1N/" }'

// The object enclosed in single quotes should be of the form

// {
//   "date": "2020.10.09",
//   "presenters": "Tom Collins",
//   "idPresenters": ["tcollins"],
//   "title": "Coding session 1: Introduction to JavaScript and p5js",
//   "recording": "https://drive.google.com/file/d/1oPF4C98j8-oMX6EH-nPd2xRLzY0D2fdq/"
// }

// and will cause the following to be added to the events archive index:

// "2020.10.09": {
//   "date": "2020.10.09",
//   "presenters": "Tom Collins",
//   "idPresenters": ["tcollins"],
//   "title": "Coding session 1: Introduction to JavaScript and p5js",
//   "recording": "https://drive.google.com/file/d/1oPF4C98j8-oMX6EH-nPd2xRLzY0D2fdq/"
// }

// Occasionally, we have more than one recording/event on the same date. In such circumstances, I have tended to index/key these as "2020.10.02.I", "2020.10.02.II", so I have made a flag for defining such keys as different to the displayed date.


// Requires
require("dotenv").config()
console.log("process.env:", process.env)
const argv = require('minimist')(process.argv.slice(2))
const fs = require("fs")
const path = require("path")

// Paths/parameters
const dataLayerRoot = path.join('.', '..', '..', '.data', 'events_archive')

const { "v4": uuidv4 } = require("uuid")

let myEvents
let ev
if (argv.e){
  ev = JSON.parse(argv.e)
}
else {
  console.log("No event data provided. Returning early.")
  return
}
let date = ev["date"]
if (argv.d){
  date = argv.d
}
console.log("date:", date)


// Check ev has all the fields we expect.
// ...


fs.readFile(
  path.join(dataLayerRoot, 'index.json'),
  {
    "encoding": "utf8"
  },
  function(err, data){
    if (err) throw err
    const myEvents = JSON.parse(data)
    // console.log("myEvents:", myEvents)
    myEvents[date] = ev

    // Write new version of user_sessions.json
    fs.writeFileSync(
      path.join(dataLayerRoot, 'index.json'),
      JSON.stringify(
        myEvents, null, 2
      ),
      {
        "flag": "w",
        "encoding": "utf8"
      }
    )
    console.log('myEvents[date]:', myEvents[date])
  }
)

