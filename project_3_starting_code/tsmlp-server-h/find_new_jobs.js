const fs = require("fs")
const path = require("path")
const execSync = require('child_process').execSync

const nodemailer = require("nodemailer")
const transporter = nodemailer.createTransport({
  "service": "gmail",
  "auth": {
    "user": "meh",
    "pass": "meh"
  }
})

let rootDir
// let urlForCurl
if (process.env.DEVMODE === "prod"){
  rootDir = path.join("/home", "tsmlp", "project_files")
  // urlForCurl = "https://tsmlp.onrender.com"
}
else {
  rootDir = path.join(
    "/Users", "tomthecollins", "Shizz", "UMiami", "Projects", "tsmlp",
    "dev_server"
  )
  // urlForCurl = "http://0.0.0.0:3003"
}

const errorsAndFixes = {
  "modelDsetNotFound": {
    "errMsg": "We could not identify the variant of the model specified in your job setup.",
    "fixMsg": "This is a Cocreate problem, and we would be happy to hear from you about it. Sometimes our listings of available model variatns get out of sync, e.g., due to a contributor withdrawing consent for use."
  },
  "fileDownload": {
    "errMsg": "We were not able to download the file you linked in your job setup.",
    "fixMsg": "<ul><li>These links must be to Google Drive files whose share settings are \"Anyone on the Internet with this link can view\".</li><li>The link must begin \"https://drive.google.com/file/d/\" followed by the Drive id for the file.</li><li>File size can also be an issue. As a rule of thumb, if your file size is over 100 MB, consider breaking it into multiple smaller files and working with those instead.</li></ul>"
  },
  "audioPreProcessing": {
    "errMsg": "An error was encountered while processing your uploaded audio file.",
    "fixMsg": "We are working on incorporating more flexible and robust audio processing, but meantime, audio files should be<ul><li>Of type WAV,</li><li>44.1 kHz sample rate, and</li><li>16 bits per sample.</li></ul> Different models may treat multichannel data differently (e.g., some may operate on the first channel only, whereas others may average over multiple channels)."
  },
  "midiPreProcessing": {
    "errMsg": "An error was encountered while processing your uploaded MIDI file.",
    "fixMsg": "We are working on incorporating more flexible and robust MIDI processing, but meantime, MIDI files should be<ul><li>Of type 1, and</li><li>produce output when dropped over https://tonejs.github.io/Midi/</li></ul> Different models may treat multitrack data differently (e.g., some may operate on the first track only, whereas others may operate on multiple tracks)."
  },
  "modelRunning": {
    "errMsg": "An error was encountered while running the model variant you selected.",
    "fixMsg": "This is a relatively rare error, and we would be happy to hear from you about it so that we can investigate and fix it."
  },
  "resultsUpload": {
    "errMsg": "An error was encountered while uploading your results.",
    "fixMsg": "This is a relatively rare error, and we would be happy to hear from you about it so that we can investigate and fix it."
  }
}


exports.find_new_jobs = function(){
 // console.log("I am still running")
  // Paths to files
  const allJobsPath = path.join(rootDir, "jobs.json")
  const prevJobIdsPath = path.join(rootDir, "idJobs.json")
  const ioPath = path.join(rootDir, "io")

  // Read jobs info.
  let jobsInfoStr = fs.readFileSync(allJobsPath, "utf8")
  //console.log("jobsInfoStr:", jobsInfoStr)
  const jobsInfo = JSON.parse(jobsInfoStr)

  // Read existing job ids.
  const existingJobIds = JSON.parse(
    fs.readFileSync(prevJobIdsPath, "utf8")
  )
  console.log("existingJobIds:", existingJobIds)
  // const idNewJobs = jobsInfo.map(function(job){ return job["idJob"] })
  // console.log("idNewJobs:", idNewJobs)
  const newJobs = jobsInfo.filter(function(ji){
    const alreadyRun = existingJobIds.find(function(jid){
      return jid === ji["idJob"]
    })
    return !alreadyRun
  })
  console.log("newJobs:", newJobs)
  const allJobIds = existingJobIds.concat(newJobs.map(function(nj){ return nj["idJob"] }))
  console.log("allJobIds:", allJobIds)

  fs.writeFileSync(
    prevJobIdsPath,
    JSON.stringify(allJobIds)//, null, 2)
  )


  newJobs.forEach(function(job){

    try {
      // Here are a couple of example job JSON structures.
      // {
      //   "idJob": "cce0",
      //   "idUser": "1c6f5",
      //   "email": "tomthecollins@gmail.com",
      //   "stampCreate": "2023-05-09T14:14:08.372Z",
      //   "myPath": "2024/2/12",
      //   "origUrl": "https://drive.google.com/file/d/1rsz1ReJNTsvAVKi1Ha6JxUCkfA0IExZL/view?usp=drive_link",
      //   "projectName": "Meh"
      // },
      // {
      //   "idJob": "19a74",
      //   "idUser": "1c6f5",
      //   "email": "tomthecollins@gmail.com",
      //   "stampCreate": "2025-05-09T11:13:11.172Z",
      //   "myPath": "2025/5/9",
      //   "origUrl": "https://drive.google.com/file/d/1Od6G3FtdMYLzoHQ9LTkEpm-i6-fDIOWi/view?usp=sharing",
      //   "projectName": "Meh 2: Return of the meh"
      // }

      const myTpo = { "description": "I'm a TSMLP project object (TPO)." }

      link2exec_str(job["origUrl"], rootDir, "lovely", ".wav")

      // ftp_files(
      //   myTpo, job["myPath"], job["myPath"].split("/"), job["idJob"],
      //   job["origUrl"], job["emailAddr"]
      // )


      // if (job["idModel"] === "meh"){
      //
      // }
      // else if (job["idModel"] === "meh2"){}
      // else if...

    }
    catch (err){
      console.error(err)
    }




  })

}


function ftp_files(
  tpo, myPath, dateArray, newJobId, origUrl, emailAddr
){
  // Upload files to remote FTP server.
  console.log("I am ftp-ing")
  // FTP it.
  let execStr_b = 'cd '+ myPath +'\n'
  execStr_b += 'ftp -n tomcollinsresearch.net << EOF\n'
  execStr_b += 'quote USER ' + process.env.FTP_USR + '\n'
  execStr_b += 'quote PASS ' + process.env.FTP_PWD + '\n'
  //making sure the file is being uploaded with the right encoding
  execStr_b +='binary\n'
  //add new folder with date stamp and subfolder with ID if it doesn't exist yet
  execStr_b += 'cd public_html/research/data/pc\n'
  //To get around the error with including "/" in mkdir command
  execStr_b +='mkdir ' + dateArray[0] + '\n'
  execStr_b += 'cd '+ dateArray[0] + '\n'
  execStr_b +='mkdir ' + dateArray[1]+ '\n'
  execStr_b += 'cd '+ dateArray[1]+ '\n'
  execStr_b +='mkdir ' + dateArray[2]+ '\n'
  execStr_b += 'cd '+ dateArray[2]+ '\n'
  execStr_b +='mkdir '+ newJobId + '\n'
  execStr_b += 'cd '+ newJobId+ '\n'

  //gets the Audio file
  for(let j=0; j<origUrl.length; j++){
    let name='audio'+j
    execStr_b += 'put '+ name+ '.wav\n'
  }

  execStr_b += 'quit\n'
  execStr_b += 'EOF'

  console.log("execStr_b:", execStr_b)
  let resStr_b = execSync(execStr_b, { encoding: 'utf-8' })
 // console.log("resStr_b:", resStr_b)

  console.log("sends email")
  // In the function below, there is also a resLink.
  // I need to think about what I'm doing with the user on the front-end here.
  notify_user(emailAddr, newJobId)


  // createObject.create_tpo(tpo)



  //removes files from tmp directory created.
  //need to implement try catch
  execStr_b= 'rm -rf '+myPath
  resStr_b = execSync(execStr_b, { encoding: 'utf-8' })
  console.log("resStr_bBis:", resStr_b)
  //rm -rf
}


function link2exec_str(link, aPath, name, ext){
  // console.log("executes function")
  let idFile = link.split("https://drive.google.com/file/d/")[1]
  console.log("idFile 1st time:", idFile)
  idFile = idFile.split("/view?usp=")[0]
  // usp=shar and usp=drivesdk are both possibilities.
  // Maybe change to
  // idFile = idFile.split("/view?usp=shar")[0]
  // to accommodate both sharing (old?) and share_link (new?)?
  console.log("idFile 2nd time:", idFile)

  // Solution from https://stackoverflow.com/questions/48388914/wget-get-past-infected-with-a-virus-screen-on-google-drive
  // wget --save-cookies /tmp/cookies.txt --keep-session-cookies --no-check-certificate "https://docs.google.com/uc?export=download&id=1JoQgu-9jR8c2XApCR49bvRbLD5OGuFhf" -O- | sed -rn 's/.*confirm=([0-9A-Za-z_]+).*/\1\n/p' > /tmp/confirm && wget --load-cookies /tmp/cookies.txt --no-check-certificate "https://docs.google.com/uc?export=download&confirm="$(cat /tmp/confirm)"&id=1JoQgu-9jR8c2XApCR49bvRbLD5OGuFhf" -O meh2.zip && rm /tmp/cookies.txt /tmp/confirm

  // execStr = 'cd ' + '/home/pc-proj/project_files/tmp\n'
  let execStr =
  "wget --save-cookies /tmp/cookies.txt --keep-session-cookies --no-check-certificate " +
  "'https://docs.google.com/uc?export=download&id=" + idFile + "' -O /tmp/intermediate.html && " +
  "LC_CTYPE=C sed -rn 's/.*confirm=([0-9A-Za-z_]+).*/\\1/p' /tmp/intermediate.html > /tmp/confirm && " +
  "wget --load-cookies /tmp/cookies.txt --no-check-certificate " +
  "'https://docs.google.com/uc?export=download&confirm='$(cat /tmp/confirm)'&id=" + idFile + "' -O " +
  path.join(aPath, name + ext) + " && rm /tmp/cookies.txt /tmp/confirm /tmp/intermediate.html";

  let resStr = execSync(execStr, { encoding: 'utf-8' })
  return execStr
}


function notify_user(emailAddr, jobId, resLink){
  console.log("emailAddr:", emailAddr)
  //////////////////////////////////////////////
  // Send an email about the job to the user. //
  //////////////////////////////////////////////
  const author = "TSMLP"
  const sender = process.env.TEST_SENDER
  const subject = "Generation job complete"
  // const browseLink = "https://unmix.glitch.me/?id="
  let emailText
  if (resLink.indexOf("https://drive.google.com/") >= 0){
    emailText = "Hi there!<br><br>Your files for job id " + jobId
    + " have been processed. You can now access them via: <br>"
  }
  else {
    emailText = "Hi there!<br><br>The output for job id " + jobId
    + " is: <br>"
  }
  emailText += resLink // browseLink + jobId
  emailText += "<br><br>Kind regards,<br>T. Collins<br><br>"

  const mailOptions = {
    from: '"'+author+'" <'+sender+'>', // Sender address
    to: emailAddr, // List of receivers
    subject: subject, // Subject line
    text: emailText, // Plaintext body
    html: emailText // HTML body
  }

  // Send mail with defined transport object.
  transporter.sendMail(mailOptions, function(error, info){
    if(error){
      return console.log(error)
    }
    console.log('Message sent: ' + info.response)

    // Store in comments.
    // const mailDetails = {
    //   id: Date.now(),
    //   author: "From: " + author + " <" + process.env.TEST_SENDER + ">, To: " + email,
    //   text: "Saying: " + emailText,
    // };
    // comments.push(mailDetails)


  })
}


function notify_user_of_error(emailAddr, jobId, errFixKey){
  console.log("emailAddr:", emailAddr)
  //////////////////////////////////////////////
  // Send an email about the job to the user. //
  //////////////////////////////////////////////
  const author = "Cocreate"
  const sender = "musicaialg2048@gmail.com"
  const subject = "Generation job failed"
  const browseLink = "https://unmix.glitch.me/?id="
  const emailText = "Hi there!<br><br>There was a problem processing your job with id <strong>" + jobId + "</strong>. Details of the error are as follows:<br>" +
  "<pre>" + errorsAndFixes[errFixKey]["errMsg"] + "</pre><br>" +
  "The suggested fix is as follows:<br><br>" +
  errorsAndFixes[errFixKey]["fixMsg"] + "<br><br>" +
  "If, having read the error description and suggested fix, you are unsure how to proceed or think the issue is with Cocreate, reply to this email quoting the job id in bold above, and we will investigate.<br><br>Kind regards,<br>T. Collins<br><br>"

  const mailOptions = {
    from: '"'+author+'" <'+sender+'>', // Sender address
    to: emailAddr, // List of receivers
    subject: subject, // Subject line
    text: emailText, // Plaintext body
    html: emailText // HTML body
  }

  // Send mail with defined transport object.
  transporter.sendMail(mailOptions, function(error, info){
    if(error){
      return console.log(error)
    }
    console.log('Message sent: ' + info.response)
  })
}


function check_uploaded_audio_file(pth){
  // MIME type
  let myStr = "file --mime-type " + pth
  let res = execSync(myStr, { encoding: 'utf-8' })
  const mimeType = res.split("\n")[0].split(" ")[1]
  // console.log("mimeType:", mimeType)
  if (mimeType !== "audio/x-wav"){
    return false
  }
  else {
    console.log("It's legit wav!")
  }

  const audioFileProps = get_audio_file_properties(pth)

  // Sample rate
  if (audioFileProps.sampleRate !== 44100){
    return false
  }
  else {
    console.log("It's legit 44.1 kHz!")
  }

  // Bit depth
  if (audioFileProps.bitsPerSample !== 16){
    return false
  }
  else {
    console.log("It's legit 16 bit!")
  }

  // Size limit if we want to...
  // myStr = "du " + pth
  // res = execSync(myStr, { encoding: 'utf-8' })
  // const sz = parseInt(res.split("\n")[0].split("\t")[0])
  // console.log("sz:", sz)
  // if (sz === -1){
  //   return false
  // }
  // else {
  //   console.log("It's legit small enough on disk!")
  // }

  return true
}


function get_audio_file_properties(fnam){
  // Solution adapted from MikeyZat (2022) at
  // https://github.com/WebAudio/web-audio-api/issues/30#issuecomment-1090167849
  const out = fs.readFileSync(fnam)
  const buffer = out.buffer
  const view = new DataView(buffer)
  const chunkCellSize = 4

  const isWave = get_chunk_name(0, chunkCellSize, buffer).includes("RIFF")
  if (!isWave) return { isWave: false, sampleRate: 0, bitsPerSample: 0 }

  let offset = 12
  let chunkName = get_chunk_name(offset, chunkCellSize, buffer)
  let chunkSize = 0

  while (!chunkName.includes("fmt")){
    chunkSize = view.getUint32(offset + chunkCellSize, true)
    offset += 2 * chunkCellSize + chunkSize; // name cell + data_size cell + data size
    chunkName = get_chunk_name(offset, chunkCellSize, buffer)

    if (offset > view.byteLength)
      throw new Error("Couldn't find sampleRate.")
  }

  const sampleRateOffset = 12
  const bitsPerSampleOffset = 22

  const sampleRate = view.getUint32(offset + sampleRateOffset, true)
  const bitsPerSample = view.getUint16(offset + bitsPerSampleOffset, true)

  return { isWave: true, sampleRate, bitsPerSample }
}


function get_chunk_name(newOff, ccs, ab){
  // console.log("newOff, ccs, ab:", newOff, ccs, ab)
  return String.fromCharCode.apply(
    null,
    new Int8Array(ab.slice(newOff, newOff + ccs))
  )
}
