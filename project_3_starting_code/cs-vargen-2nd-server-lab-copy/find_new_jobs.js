console.log("find_new_jobs: I am running")
const fs = require("fs")
const path = require("path")
const execSync = require('child_process').execSync

// Nodemailer setup
const nodemailer = require("nodemailer")
const transporter = nodemailer.createTransport({
  "service": "gmail",
  "auth": {
    "user": "musicaialg2048@gmail.com",
    "pass": "faqwzwspnyhobceu"
  }
})
// Should be moved to a hidden file locally.
const FTP_USR = 'someone@tomcollinsresearch.net'
const FTP_PWD = 'usrpwd'

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
    const rootDir = path.join("/home", "vargen")
    const allJobsPath = path.join(rootDir, "jobs.json")
    const prevJobIdsPath = path.join(rootDir, "idJobs.json")
    const ioPath = path.join(rootDir, "tmp_io")

    // Read jobs info.
    let jobsInfoStr = fs.readFileSync(allJobsPath, "utf8")
    //console.log("jobsInfoStr:", jobsInfoStr)
    const jobsInfo = JSON.parse(jobsInfoStr)
    // Read existing job ids.
    const existingJobIds = JSON.parse(
        fs.readFileSync(prevJobIdsPath, "utf8")
        )
    console.log("existingJobIds:", existingJobIds)

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

    // Obtain files and prepare to FTP them elsewhere.
    newJobs.forEach(function(job){
        const jobIdModel = job.idModel // TODO: Need to be pass through job.idModel
        const jobDsetName = job.dsetName // TODO: Need to be pass through job.dsetName
        const idUser = job.idUser
        let themeUrl = job.midiUrl
        themeUrl = themeUrl.replace(/\s/g,"%20")
        console.log(">themeUrl", themeUrl)
        obtain_files(rootDir, ioPath, themeUrl, job.idJob, jobIdModel, jobDsetName, idUser)
        // ...
        // Job has finished running

    });
}

function obtain_files(rootDir, ioPath, themeUrl, newJobId, jobIdModel, jobDsetName, idUser){
    // Writes files from Glitch server link to the 2nd server.
    // Subsequently, these files are removed after the analysis and upload to remote FTP server has occured.

    // Move to right location
    let execStr_a = 'cd ' + ioPath + '\n'
    // Create new folder with JobID if it doesn't exist already
    execStr_a +='mkdir '+ '-p ' + newJobId + '\n'
    execStr_a += 'cd '+ newJobId+ '\n'

    let resStr_a = execSync(execStr_a, { encoding: 'utf-8' })
    console.log("resStr_a:", resStr_a)

    // Get file from Glitch server link.
    // The file will be saved to a folder: rootDir + '/tmp_io/' + newJobId + '/'
    const theme_path_2nd_server = ioPath + '/' + newJobId + '/'
    let execStr_b = 'wget -O ' + theme_path_2nd_server + newJobId + '_theme.mid ' + themeUrl + '\n'
    let resStr_b = execSync(execStr_b, { encoding: 'utf-8' })
    console.log("resStr_b:", resStr_b)

    // TODO: Variation generation.
    if (jobIdModel === "varGen"){
      // Convert the model label from Cocreate front-end into the saved model
      // name on the transcription machine.
      // mllml stands for model label lm-flag lookup!
      const mllml = require(
        path.join(
          __dirname, "models", "vargen", "var_gen_lookup.json"
        )
      )
      if (mllml[jobDsetName] === undefined){
        console.log("Model label/dataset not found. Returning early.")
        return
      }
      console.log('mllml[jobDsetName]:', mllml[jobDsetName])

      let myStr
      const aPath = path.join(ioPath, newJobId)
      const outPath = path.join(ioPath, newJobId)
      const name = newJobId
      const ext = ".mid"

      // let seed = 30
      // if (job["oneSeed"]){
      //   seed = parseInt(job["oneSeed"])
      //   if (isNaN(seed)){
      //     seed = 30
      //   }
      // }

      // // TODO: we will need these lines, and need to re-write 'cleanse_midi.js'.
      // if (job["midiInUrl"]){
      // 1. Apply in/out procedure to it, so that it is quantised, all on
      // one track, and that track has a particular name.
      myStr = "cd models/midi_preprocess\n"
      + "node cleanse_midi"
      + " -u vargen"
      + " -j " + newJobId
      + " -f " + newJobId + "_theme" + "\n"
      + "cd -\n"
      console.log("Script execution string:", myStr)
      res = execSync(myStr, { encoding: 'utf-8' })
      console.log("res:", res)
      // }



      // 2. Construct command-line command


      myStr = "eval \"$(conda shell.bash hook)\"\n" +
      "conda activate vargen\n" +
      "CUDA_VISIBLE_DEVICES=1 python3 ./models/vargen/workspace/gen_VaTr_var_user_input.py" +
      " --lm /home/vargen/trained_models/" + mllml[jobDsetName] +
      " --seq_len 1025 --n_bars 16 --p 0.9" +
      " --save_to " + path.join(outPath, name + '_var' + ext) +
      " --input " + path.join(aPath, name+ '_theme' + ext)


      myStr +=
      // " --seed " + seed
      "\n" +
      "conda deactivate"
      console.log("myStr:", myStr)
      res = execSync(myStr, { encoding: 'utf-8' })

      // // 4. Notify user that the generation job is complete.
      // notify_user(job["email"], name, resultsLink)

    }

    // 3. FTP theme and generated variation.
    const myPath = rootDir + '/tmp_io/' + newJobId + '/'
    const ThemeMidiName = newJobId + '_theme.mid'
    ftp_files(myPath, newJobId, ThemeMidiName, idUser)
    const VarMidiName = newJobId + '_var.mid'
    ftp_files(myPath, newJobId, VarMidiName, idUser)

    // 4. removes files from tmp directory created.
    // need to implement try catch
    execStr_b = 'rm -rf '+ myPath
    resStr_b = execSync(execStr_b, { encoding: 'utf-8' })
    console.log("resStr_bBis:", resStr_b)

    // 5. Notify Glitch end the job is completed.
    const newJobCompleteUrl = "https://tomcollinsresearch.net/participantStudies/var24/tmp_io/" + idUser + "/" + newJobId + "/"
    test_send_job_complete(newJobId, newJobCompleteUrl, idUser)
}

// This function will be used to notify the Glitch side that the job has been completed.
function test_send_job_complete(newJobId, newJobCompleteUrl, idUser){
  let execStr = 'curl -X GET'
  execStr += ' -H "Content-Type: application/json"'
  // A fake example.
  // execStr += ' -is "https://var-gen.glitch.me/jobComplete?sig=e0944fd2d427cg&idJob=examplejobid234&urls=https://tomcollinsresearch.net/blahblah/ex.mid"'
  execStr += ' -is "https://var-gen.glitch.me/jobComplete?sig=e0944fd2d427cg&idJob=' + newJobId + '&urls=' + newJobCompleteUrl + '&idUser=' + idUser +'"'
  console.log("execStr:", execStr)
  const resStr = execSync(execStr, { encoding: 'utf-8' }).split("\r\n\r\n")[1]
  console.log("resStr:", resStr)
  const res = JSON.parse(resStr)
  console.log("res:", res)
}



function ftp_files(myPath, newJobId, midiName, idUser){
    // uploads files to remote FTP server
    console.log("I am ftpinging")
    // FTP it.
    // myPath is the tmp folder where a midi file is stored on the 2nd server.
    let execStr_b = 'cd '+ myPath +'\n'
    execStr_b += 'ftp -n tomcollinsresearch.net << EOF\n'
    execStr_b += 'quote USER ' + FTP_USR + '\n'
    execStr_b += 'quote PASS ' + FTP_PWD + '\n'
    // making sure the file is being uploaded with the right encoding
    execStr_b +='binary\n'
    // Go to the folder that storing temporary files.
    execStr_b += 'cd tmp_io\n'
    // Create a folder for each idUser.
    execStr_b +='mkdir '+ idUser + '\n'
    execStr_b += 'cd '+ idUser + '\n'
    // add new folder with date stamp and subfolder with ID if it doesn't exist yet
    execStr_b +='mkdir '+ newJobId + '\n'
    execStr_b += 'cd '+ newJobId + '\n'

    // Upload the MIDI file
    execStr_b += 'put '+ midiName + '\n'

    execStr_b += 'quit\n'
    execStr_b += 'EOF'

    console.log("execStr_b:", execStr_b)
    let resStr_b = execSync(execStr_b, { encoding: 'utf-8' })
    // console.log("resStr_b:", resStr_b)

    // TODO: Notify user in the future.
    // console.log("sends email")
    // notify_user(job["emailAddress"], job["id"])
}
