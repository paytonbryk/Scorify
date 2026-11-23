class Client {
  constructor(){
    // this.sketch = new p5(
    //   this.load_sketch.bind(this), "lovelySketch"
    // )
    const self = this
    self.idRoom = null
    self.user = {}

    // Set up a structure for model parameter settings.
    self.modelParam = {
      "varGen": {
        "runOrTrain": "run",
        "dsetName": "VaTr VGMIDI",
        // "midiInUrl": "",
        // "oneSeed": 30,
      },
    }
    self.idModels = Object.keys(self.modelParam)
    // // Once the "submit" button is clicked, a new job will be added.
    // self.idModels.forEach(function(idm){
    //   document.getElementById(idm).addEventListener("submit", function(e){
    //     e.preventDefault()
    //     self.add_job(idm)
    //     document.body.scrollTop = document.documentElement.scrollTop = 0
    //   })
    // })
    
    // Try to add an event listener for dropdown menu.
    const mainDropdown = document.getElementById('mySelect')
    mainDropdown.addEventListener('change', function() {
        const selectedContent = mainDropdown.value
        const selectedId = mainDropdown.selectedIndex
        const selectedJobId = mainDropdown.options[selectedId].text
        console.log("selectedJobId", selectedJobId)
        // TODO: Update MIDI player
        // Update url of MIDI-player and MIDI-visualizer to the current generation result.
        const themeUrl = selectedContent + selectedJobId + "_theme.mid"
        const varUrl = selectedContent + selectedJobId + "_var.mid"
        // Theme midi player.
        const themeMidiPlayer = document.getElementById("authMidiPlayerTheme")
        themeMidiPlayer.setAttribute("src", themeUrl)
        const themeMidiVisualizer = document.getElementById("authMidiVisualizerTheme")
        themeMidiVisualizer.setAttribute("src", themeUrl)

        // Var midi player.
        const varMidiPlayer = document.getElementById("authMidiPlayerVar")
        varMidiPlayer.setAttribute("src", varUrl)
        const varMidiVisualizer = document.getElementById("authMidiVisualizerVar")
        varMidiVisualizer.setAttribute("src", varUrl)
    });
    
    // Scripts for the model selector:
    var dropdownMenu = document.getElementById('model-selector');
    var selectedOptionText = document.getElementById('selected-option');

    // Listening to drop-down menu changes
    dropdownMenu.addEventListener('change', function() {
        // Get the value of the selected option
        var selectedValue = dropdownMenu.value;
        self.modelParam["varGen"]["dsetName"] = selectedValue

        // Update the content
        selectedOptionText.textContent = 'You selected: ' + selectedValue;
    });

  }

  
  auth(){
    const self = this
    // Obtain any magic link appearing on the URL of the connecting client/browser.
    const userMl = this.get_parameter_by_name("ml")
    if (userMl !== null){
      // If magic link present, use a fetch here to try to authenticate the user.
      const upData = {
        "ml": userMl
      }
      console.log("upData:", upData)
      fetch("/authenticate", {
        method: "POST",
        body: JSON.stringify(upData),
        headers: { "Content-Type": "application/json" }
      })
      .then(
        function(res){
          console.log("res:", res)
          return res.json()
        }
        // res => res.json()
      )
      .then(
        function(downData){
        // downData => {
          console.log(downData)
          // ...
          if (downData["hello"] === "Authentication successful!"){
            self.remove_children_of_element("theMainThing")
            self["user"] = {
              "email": downData["email"],
              "magicLink": downData["magicLink"],
              "apiKeys": downData["apiKeys"],
              "idUser": downData["allTheDetails"]["id"],
              "genHistory": downData["genHistory"]
            }
            console.log("self.user", self.user)
            
            const div = document.getElementById("theMainThing")
            const p = document.createElement("p")
            // Get url list for MIDIs.
            const jsonDownData = downData["allTheDetails"]
            const midiUrlList = jsonDownData.genVars
            console.log("midiUrlList", midiUrlList)
            // // To display downData in the front end.
            // const txt = document.createTextNode(JSON.stringify(downData["allTheDetails"]))
            // p.appendChild(txt)
            // div.appendChild(p)
            
            // Display select list
            const authSelect = document.getElementById("authSelect")
            authSelect.hidden = false

            // // Change url of MIDI-player and MIDI-visualizer.
            const midiDiv = document.getElementById("authMidi")
            midiDiv.hidden = false
            const varGenDiv = document.getElementById("varGen")
            varGenDiv.hidden = false
            
            // Update the content in the dropdown menu according to the current user's generation history.
            const dropdownMenu = document.getElementById('mySelect')
            const newDropdownContent = self.user.genHistory // Read from JSON, which should be keys.

            const options = Object.keys(newDropdownContent)
            dropdownMenu.innerHTML = '<option>Select an option</option>'; // Clean the existing option
            options.forEach(function(option) {
                  let newOption = document.createElement('option');
                  newOption.textContent = option;
                  newOption.value = newDropdownContent[option];
                  dropdownMenu.appendChild(newOption);
            });

          }
          
        }
      )
    }
    
  }
  
  generate_magic_link(){
    const upData = {
      "emailAddress": document.getElementById("emailAddr2").value,
      "otherStuff": {
        "hi": 123
      }
    }
    console.log("upData:", upData)
    fetch("/generateMagicLink", {
      method: "POST",
      body: JSON.stringify(upData),
      headers: { "Content-Type": "application/json" }
    })
    .then(
      function(res){
        console.log("res:", res)
        return res.json()
      }
      // res => res.json()
    )
    .then(
      function(downData){
      // downData => {
        console.log(downData)
      }
    )
  }
  
  // Helper functions
  get_parameter_by_name(name){
    let match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '))
  }
  
  
  remove_children_of_element(id){
    const el = document.getElementById(id)
    while(el.firstChild){
      el.removeChild(el.firstChild)
    }
  }
  
  make_a_break(){
    let br = document.createElement("br")
    return br
  }
  
  // For MIDI file uploading through 'fileUpload' input box. 
  // Write MIDI files to the server only if the user is authenticated.
  midi_upload(){
    const self = this
    const fileInput = document.getElementById('fileUpload')
    console.log(fileInput.files[0])
    const formData = new FormData()
    formData.append('file', fileInput.files[0])
    
    fetch("/fileupload", {
      method: "POST",
      body: formData
    })
    .then(
      function(res){
        console.log("res:", res)
        return res.json()
      }
      // res => res.json()
    )
    .then(
      function(downData){
      // downData => {
        // console.log(downData['file'])
        const fName = downData['file'].split('/')
        const link = "https://var-gen.glitch.me/midi/" + fName[fName.length - 1]
        // Once the 'generate' button is clicked, a new job will be added. 
        console.log(">link:", link)
        const jobIdModel = "varGen"
        const midiUrl = link
        self.add_job(jobIdModel, midiUrl)
        // document.body.scrollTop = document.documentElement.scrollTop = 0
        // TODO: prepare animation for waitting
      }
    )
  }
  
  add_job(idModel, midiUrl){
    const self = this
    if (self.user.email === undefined){
      alert("You must log in to use this site. At present, accounts are made by invitation only.")
      return
    }
    const basics = {
      "idUser": self.user.idUser,
      "email": self.user.email,
      "apiKey": self.user.apiKeys, // Not sure why "apiKey" is defined like this...
      "idModel": idModel,
      "midiUrl": midiUrl
    }
    const specifics = self.modelParam[idModel]
    const upData = { ...basics, ...specifics }
    console.log("upData:", upData)
    fetch("/addJobToQueue", {
      method: "POST",
      body: JSON.stringify(upData),
      headers: { "Content-Type": "application/json" }
    })
    .then(
      function(res){
        console.log("res:", res)
        return res.json()
      }
      // res => res.json()
    )
    .then(
      function(downData){
      // downData => {
        console.log(downData)
        // self.remove_children_of_element("notification")
        // const notifn = document.getElementById("notification")
        let txt
        if (downData["message"] === "The variation is generated!"){
          txt = document.createTextNode(
            "Your job id is: " + downData["idJob"] +
            ". The job has been finished."            
          )
          console.log("txt", txt)
          // TODO: Update the interface
          // Update url of MIDI-player and MIDI-visualizer to the current generation result.
          const themeUrl = downData["urls"] + downData["idJob"] + "_theme.mid"
          const varUrl = downData["urls"] + downData["idJob"] + "_var.mid"
          // Theme midi player.
          const themeMidiPlayer = document.getElementById("authMidiPlayerTheme")
          themeMidiPlayer.setAttribute("src", themeUrl)
          const themeMidiVisualizer = document.getElementById("authMidiVisualizerTheme")
          themeMidiVisualizer.setAttribute("src", themeUrl)
            
          // Var midi player.
          const varMidiPlayer = document.getElementById("authMidiPlayerVar")
          varMidiPlayer.setAttribute("src", varUrl)
          const varMidiVisualizer = document.getElementById("authMidiVisualizerVar")
          varMidiVisualizer.setAttribute("src", varUrl)
          
          // TODO: Update the content in the dropdown menu
          // Update the content in the dropdown menu according to the current user's generation history.
          const dropdownMenu = document.getElementById('mySelect')
          let newOption = document.createElement('option');
          newOption.textContent = downData["idJob"];
          newOption.value = downData["urls"];
          dropdownMenu.appendChild(newOption);

          
          document.body.scrollTop = document.documentElement.scrollTop = 0
        }
        else {
          txt = document.createTextNode("Job not queued. Please seek help!")
        }
        // Change the notification message.
        // notifn.appendChild(txt)
        
      }
    )
  }
  
}





      
const myClient = new Client()
myClient.auth()
