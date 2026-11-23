class MyClient {
  constructor(){
    const self = this
    // Determine if this is Safari/Chrome on iOS, where iframes don't seem to work.
    const ua = window.navigator.userAgent
    self.iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i)
    console.log("self.iOS:", self.iOS)
    
    self.auth = new Auth()
    // self.blog = new Blog()
    // self.contest = new Contest()
    // ...
    self.util = new Util()
    
    // document.getElementById("searchBtn")
    // .addEventListener("click", function(e){
    //   e.preventDefault()
    //   self.search()
    // })
    // document.getElementById("keywords")
    // .addEventListener("keypress", function(e){
    //   if (e.key === "Enter"){
    //     self.search()
    //   }
    // })
    // document.getElementById("prevSearchBtn")
    // .addEventListener("click", function(e){
    //   e.preventDefault()
    //   alert("Does nothing at present!")
    // })
    // document.getElementById("nextSearchBtn")
    // .addEventListener("click", function(e){
    //   e.preventDefault()
    //   alert("Does nothing at present!")
    // })
    
    // const calIfr = document.getElementById("calIfr")
    // calIfr.setAttribute("height", "500px")
    // if (self.iOS){
    //   calIfr.setAttribute("width", "67%")
    // }
    // else {
    //   calIfr.setAttribute("width", "67%")
    // }
    
    //////////////////////////////////////////////////
    // THIS IS WHERE WE WERE ADDING STUFF TO VIDEOS //
    //////////////////////////////////////////////////
    
    // self.add_archive('downArchive2023', 2023)
    // document.getElementById("tabArchive2023")
    // .addEventListener("click", function(e){
    //   self.add_archive('downArchive2023', 2023)
    // })
    // document.getElementById("tabArchive2022")
    // .addEventListener("click", function(e){
    //   self.add_archive('downArchive2022', 2022)
    // })
    // document.getElementById("tabArchive2021")
    // .addEventListener("click", function(e){
    //   self.add_archive('downArchive2021', 2021)
    // })
    // document.getElementById("tabArchive2020")
    // .addEventListener("click", function(e){
    //   self.add_archive('downArchive2020', 2020)
    // })
  }
  
  
  load_user_docs(_in){
    console.log("HELLO FROM LOAD_USER_DOCS!")
    const self = _in
    console.log("self:", self)
    
    self.util.remove_children_of_element("mainEvent")
    const me = document.getElementById("mainEvent")
    // Create the elements
    const spaceTop1 = document.createElement('div');
    spaceTop1.className = 'space-top';

    const heading = document.createElement('h1');
    heading.textContent = 'Here are your projects';

    const spaceTop2 = document.createElement('div');
    spaceTop2.className = 'space-top';

    // Append the elements to the mainEvent div
    me.appendChild(spaceTop1);
    me.appendChild(heading);
    me.appendChild(spaceTop2);
    
    // The variable called self should have an array containing this users document metadata gathered from the back-end. It needs iterating over and tabulating here, Overleaf-style.
    // ...
    
    
  }
  
  
  // Apart from a few utility functions toward the bottom, none of the following methods are used currently. Based on knowledge from previous projects, they could be of use though, so I've left them in.
  search(){
    if (this.authToken === undefined){
      alert("Sign in first, please.")
      return
    }
    
    const self = this
    const keywords = document.getElementById("keywords").value.split(" ")
    console.log("keywords:", keywords)
    if (keywords !== null){
      // If magic link present, use a fetch here to try to authenticate the user.
      const upData = {
        "authToken": self.authToken,
        "keywords": keywords
      }
      console.log("upData:", upData)
      fetch("/api/search", {
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
          if (downData["message"] === "No relevant results"){
            self.util.remove_children_of_element("sr")
            const sr = document.getElementById("sr")
            const h2 = document.createElement("h2")
            h2.setAttribute("class", "content-head is-center")
            const txt = document.createTextNode("No results. Please try different keywords.")
            h2.appendChild(txt)
            sr.appendChild(h2)
          }
          else if (downData["message"] === "Relevant results"){
            self.populate_search_results(downData["entries"], "Search results")
          }
        }
      )
    }
  }
  
  
  populate_search_results(objArr, sectionHeading, scrollIntoView = true){
    const self = this
    self.sr = objArr
    // Dealing with nulls and shortenings.
    self.sr.forEach(function(userProfile){
      // Replace any nulls with empty strings.
      userProfile.name = userProfile.name || "(No name provided)"
      userProfile.roleDept = "Role/dept.: " + (userProfile.roleDept || "")
      userProfile.skills = "Skills: " + (userProfile.skills || "")
      userProfile.description = "Description: " + (userProfile.description || "")
      // Make short entries if necessary for role/dept., skills, and description.
      // Role/dept.
      // userProfile["shortRoleDept"] = userProfile["roleDept"]
      // if (userProfile["shortRoleDept"].length > 50){
      //   userProfile["shortRoleDept"] = userProfile["shortRoleDept"].slice(0, 50) + "… [hover to see more]"
      // }
      // Skills
      userProfile["shortSkills"] = userProfile["skills"]
      if (userProfile["shortSkills"].length > 50){
        userProfile["shortSkills"] = userProfile["shortSkills"].slice(0, 50) + "… [hover to see more]"
      }
      // Description
      userProfile["shortDesc"] = userProfile["description"]
      if (userProfile["shortDesc"].length > 50){
        userProfile["shortDesc"] = userProfile["shortDesc"].slice(0, 50) + "… [hover to see more]"
      }
    })

    self.util.remove_children_of_element("sr")
    const sr = document.getElementById("sr")
    const h2 = document.createElement("h2")
    h2.setAttribute("class", "row-title")
    const txt = document.createTextNode(sectionHeading)
    h2.appendChild(txt)
    sr.appendChild(h2)
    // <h2 class="row-title">Meet the Speakers</h2>

    // Make some HTML for each result.
    self.sr.forEach(function(userProfile, idx){
      
      
      
      // <div class="col-md-4 col-sm-6 feature">
      //   <img src="style/img/speaker-1.png" class="speaker-img">
      //   <h3>Simon Collins</h3>
      //   <p>Simon is designer and partner at Fictivekin and has worked in a variety of situations for bands, record labels, governments, polar explorers, and most other things...</p>
      //   <ul class="speaker-social">
      //     <li><a href="#"><span class="ti-facebook"></span></a></li>
      //     <li><a href="#"><span class="ti-twitter-alt"></span></a></li>
      //     <li><a href="#"><span class="ti-linkedin"></span></a></li>
      //   </ul>
      // </div>
      
      
      
      
      // console.log("userProfile:", userProfile)
      const div2 = document.createElement("div")
      div2.setAttribute("class", "col-md-4 col-sm-6 feature")
      // Image
      const img = document.createElement("img")
      img.setAttribute("src", userProfile["imageLink"])
      img.setAttribute("class", "speaker-img")
      div2.appendChild(img)
      // Name and email address.
      const h3 = document.createElement("h3")
      let txt = document.createTextNode(userProfile["name"])
      h3.appendChild(txt)
      div2.appendChild(h3)
      // h3.appendChild(self.util.make_a_break())
      let p = document.createElement("p")
      txt = document.createTextNode(userProfile["email"])
      p.appendChild(txt)
      div2.appendChild(p)
      

      // Relevance score and keywords.
      p = document.createElement("p")
      let txtStr
      if (sectionHeading === "Search results"){
        txtStr = "Relevance to keywords: " + userProfile["score"]
        txt = document.createTextNode(txtStr)
        p.appendChild(txt)
        p.appendChild(self.util.make_a_break())
      }
      txtStr = "Last active: " + userProfile["lastActive"]
      txt = document.createTextNode(txtStr)
      p.appendChild(txt)
      div2.appendChild(p)

      // Role/dept., skills, and description.
      // Role/dept.
      p = document.createElement("p")
      p.setAttribute("id", "usrRoleDeptPgh_" + idx)
      txt = document.createTextNode(userProfile["roleDept"])
      p.appendChild(txt)
      // p.setAttribute("onmouseover", "myClient.mouse_over_out(this, 'roleDept')")
      // p.setAttribute("onmouseout", "myClient.mouse_over_out(this, 'shortRoleDept')")
      div2.appendChild(p)
      // Skills
      p = document.createElement("p")
      p.setAttribute("id", "usrSkillsPgh_" + idx)
      txt = document.createTextNode(userProfile["shortSkills"])
      p.appendChild(txt)
      p.setAttribute("onmouseover", "myClient.mouse_over_out(this, 'skills')")
      p.setAttribute("onmouseout", "myClient.mouse_over_out(this, 'shortSkills')")
      div2.appendChild(p)
      // Description
      p = document.createElement("p")
      p.setAttribute("id", "usrDescPgh_" + idx)
      txt = document.createTextNode(userProfile["shortDesc"])
      p.appendChild(txt)
      p.setAttribute("onmouseover", "myClient.mouse_over_out(this, 'description')")
      p.setAttribute("onmouseout", "myClient.mouse_over_out(this, 'shortDesc')")
      div2.appendChild(p)



      sr.appendChild(div2)

    })
    
    if (scrollIntoView){
      sr.scrollIntoView({ "behavior": "smooth" })
    }
  }
  
  
  mouse_over_out(_this, attr){
    console.log("id:", _this.getAttribute("id"))
    const id = _this.getAttribute("id")
    const idx = parseInt(id.split("_")[1])
    this.util.remove_children_of_element(id)
    const p = document.getElementById(id)
    const txt = document.createTextNode(
      this.sr[idx][attr]
    )
    p.appendChild(txt)
  }
  
  
  update_profile(){
    if (this.authToken === undefined){
      alert("Sign in first please.")
      return
    }
    
    const self = this
    const usrName = document.getElementById("usrName").value
    const usrImageLink = document.getElementById("usrImageLink").value
    const usrRoleDept = document.getElementById("usrRoleDept").value
    const usrSkills = document.getElementById("usrSkills").value
    const usrDescription = document.getElementById("usrDescription").value
    if (usrName !== null || usrRoleDept !== null||  usrSkills !== null || usrDescription !== null){
      const upData = {
        "authToken": self.authToken,
        "usrName": usrName,
        "usrImageLink": usrImageLink,
        "usrRoleDept": usrRoleDept,
        "usrSkills": usrSkills,
        "usrDescription": usrDescription
      }
      console.log("upData:", upData)
      fetch("/api/updateProfile", {
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
          if (downData["message"] === "Profile updated successfully."){ 
            self.util.remove_children_of_element("usrProfilePgh")
            const p = document.getElementById("usrProfilePgh")
            const txt = document.createTextNode("Profile updated successfully.")
            p.appendChild(txt)
            p.scrollIntoView({ "behavior": "smooth" })
          }
          else if (downData["message"] === "Profile update failed."){
            self.util.remove_children_of_element("usrProfilePgh")
            const p = document.getElementById("usrProfilePgh")
            const txt = document.createTextNode("For some reason, the profile update failed.")
            p.appendChild(txt)
            p.scrollIntoView({ "behavior": "smooth" })
          }
        }
      )
    }
  }
  
  
  // Utility functions
  add_archive(idParent, year){
    console.log("In add_archive()!!")
    const self = this
    console.log("self.authToken:", self.authToken)
    if (self.authToken){
      const upData = {
        "pwd": "123",
        "year": year
      }
      console.log("upData:", upData)
      fetch("/api/archive", {
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
          self.util.remove_children_of_element(idParent)
          downData.archive.forEach(function(archiveEntry){
            self.add_archive_entry(idParent, archiveEntry)
          })
        }
      )
    } // if
  }
  
  
  add_archive_entry(id, e){
    const parent = document.getElementById(id)
    const div = document.createElement("div")
    div.setAttribute("class", "col-md-6")
    const media = document.createElement("div")
    media.setAttribute("class", "media")
    const mediaLeft = document.createElement("div")
    mediaLeft.setAttribute("class", "media-left")
    const a = document.createElement("a")
    a.setAttribute("href", "#")
    const img = document.createElement("img")
    img.setAttribute("class", "media-object")
    img.setAttribute("src", e["imageLink"])
    img.setAttribute("alt", "...")
    a.appendChild(img)
    mediaLeft.appendChild(a)
    const mediaBody = document.createElement("div")
    mediaBody.setAttribute("id", "mediaMeh")
    mediaBody.setAttribute("class", "media-body")
    const h4 = document.createElement("h4")
    h4.setAttribute("class", "media-heading")
    let txt = document.createTextNode(e["date"])
    h4.appendChild(txt)
    mediaBody.appendChild(h4)
    const h5 = document.createElement("h5")
    txt = document.createTextNode(e["title"])
    h5.appendChild(txt)
    mediaBody.appendChild(h5)
    const ifr = document.createElement("video")
    ifr.setAttribute("src", e["recording"])
    ifr.setAttribute("width", "560")
    ifr.setAttribute("height", "315")
    ifr.setAttribute("frameborder", "0")
    ifr.setAttribute("allowfullscreen", "allowfullscreen")
    ifr.setAttribute("kwframeid", "1")
    ifr.setAttribute("controls", "")
    ifr.setAttribute("controlsList", "nodownload")
    // ifr.setAttribute("oncontextmenu", "return false")
    mediaBody.appendChild(ifr)
    
    
    // if (this.iOS){
    //   const a = document.createElement("a")
    //   a.setAttribute("href", e["recording"])
    //   a.setAttribute("target", "_blank")
    //   const txt = document.createTextNode("Link to recording")
    //   a.appendChild(txt)
    //   mediaBody.appendChild(a)
    // }
    // else {
    //   const ifr = document.createElement("iframe")
    //   ifr.setAttribute("src", e["recording"] + "preview")
    //   mediaBody.appendChild(ifr)
    // }
    
    const p = document.createElement("p")
    txt = document.createTextNode(e["presenters"])
    p.appendChild(txt)
    mediaBody.appendChild(p)

    media.appendChild(mediaLeft)
    media.appendChild(mediaBody)
    
    div.appendChild(media)

    parent.appendChild(div)
    
    document.getElementById("mediaMeh")
    .addEventListener("contextmenu", function(e){
      e.preventDefault()
    }, false)
    
    
    // <div class="col-md-6">
    //   <div class="media">
    //     <div class="media-left">
    //       <a href="#">
    //         <img class="media-object" src="style/img/speaker-1.png" alt="...">
    //       </a>
    //     </div>
    //     <div class="media-body">
    //       <h4 class="media-heading">2021.01.05</h4>
    //       <h5>The Sound of Movement, Citizen DJ, and other gems</h5>
    //       <iframe src="https://drive.google.com/file/d/1bYgWlLTfp9dh4Av7BRq9mYxZ0XpcgxQl/preview">

    //       </iframe>
    //       <p>
    //         <a href="https://brianfoo.com/" target="_blank">Brian Foo</a>
    //       </p>
    //     </div>
    //   </div>
    // </div>
  }
  
  
  load_profile_updater(){
    const self = this
    const div = document.getElementById("editProfile")
    const h2 = document.createElement("h2")
    h2.setAttribute("class", "content-head is-center")
    let txt = document.createTextNode("Welcome, you are signed in!")
    h2.appendChild(txt)
    div.appendChild(h2)
    
    let div2 = document.createElement("div")
    let p = document.createElement("p")
    txt = document.createTextNode("This site is intended to help you identify and connect with members of the network.")
    p.appendChild(txt)
    div2.appendChild(p)
    div.appendChild(div2)
    
    // First part of form
    div2 = document.createElement("div")
    p = document.createElement("p")
    p.setAttribute("id", "usrProfilePgh")
    txt = document.createTextNode("Please provide/update information about yourself, to help potential collaborators find you.")
    p.appendChild(txt)
    div2.appendChild(p)
    div2.appendChild(self.util.make_a_break())
    let form = document.createElement("form")
    form.setAttribute("class", "form-horizontal")
    // Set up user profile entries.
    let usrName, usrImageLink, usrRoleDept, usrSkills, usrDescription
    if (self.authToken){
      // console.log("self.userProfile:", self.userProfile)
      usrName = self.userProfile.name || ""
      usrImageLink = self.userProfile.imageLink || ""
      usrRoleDept = self.userProfile.roleDept || ""
      usrSkills = self.userProfile.skills || ""
      usrDescription = self.userProfile.description || ""
    }
    // Display them.
    // Name
    self.make_labelled_input(form, "usrName", "text", "Your name", "Firstname Lastname", usrName)
    // Image link
    self.make_labelled_input(form, "usrImageLink", "text", "Image link", "https://tomcollinsresearch.net/mc/ex/src/img/tc.png", usrImageLink)
    // Role and/or department
    self.make_labelled_input(form, "usrRoleDept", "text", "Your role and/or department", "E.g., Lecturer, School of Arts and Creative Technologies", usrRoleDept)
    // Skills
    self.make_labelled_textarea(form, "usrSkills", "Skills", "E.g., research project formation, project management, programming in JavaScript and Node.js, software design, development of progressive web apps, research methods, statistical analysis, paper writing, publishing and navigating peer review, evaluating knowledge exchange", usrSkills)
    // Description
    self.make_labelled_textarea(form, "usrDescription", "Description of your interests and/or work", "E.g., the application of machine learning and AI to music and audio", usrDescription)
    
    // Third part of form (submit)
    const div3 = document.createElement("div")
    div3.setAttribute("class", "form-group")
    const div4 = document.createElement("div")
    div4.setAttribute("class", "col-sm-offset-3 col-sm-9")
    const btn = document.createElement("button")
    btn.setAttribute("type", "submit")
    btn.setAttribute("id", "updateProfile")
    btn.setAttribute("class", "btn btn-yellow pull-right")
    txt = document.createTextNode("Update")
    // Update <span class="ti-arrow-right"></span>
    btn.appendChild(txt)
    div4.appendChild(btn)
    div3.appendChild(div4)
    form.appendChild(div3)
    // <div class="form-group">
    //   <div class="col-sm-offset-3 col-sm-9">
    //     <button type="submit" id="submit" name="submit" class="btn btn-yellow pull-right">Send <span class="ti-arrow-right"></span></button>
    //   </div>
    // </div>
    
    div2.appendChild(form)
    div.appendChild(div2)
    
    document.getElementById("updateProfile")
    .addEventListener("click", function(e){
      e.preventDefault()
      self.update_profile()
    })
  }
  
  
  load_tools(data) {
    const self = this
    // Create a container div to hold everything
    self.util.remove_children_of_element("toolsContent")
    const containerDiv = document.getElementById("toolsContent")

    // Loop through each entry in the data object
    Object.keys(data).forEach((key) => {
      // console.log("key:", key)
      const entry = data[key]
      // console.log("entry:", entry)

      // Create a div for each feature
      const featureDiv = document.createElement("div")
      featureDiv.setAttribute("class", "col-md-4 col-sm-6 feature")

      // Heading (Name)
      const heading = document.createElement("h3")
      heading.textContent = entry.name
      featureDiv.appendChild(heading)
      
      // Image
      const img = document.createElement("img")
      img.setAttribute("src", entry.imageLink)
      img.setAttribute("class", "speaker-img")
      featureDiv.appendChild(img)

      // Description(s)
      entry.description.forEach((desc) => {
        const description = document.createElement("p")
        description.innerHTML = desc // Using innerHTML to handle entities like &ldquo;
        featureDiv.appendChild(description)
      })
      featureDiv.appendChild(document.createElement("br"))

      // Consent description (if available)
      if (entry.consentDescription) {
        const consentDescription = document.createElement("p")
        consentDescription.textContent = entry.consentDescription
        featureDiv.appendChild(consentDescription)

        // Checkbox
        const consentUl = document.createElement("ul")
        consentUl.setAttribute("class", "speaker-social")

        const consentLi = document.createElement("li")
        const consentCheckbox = document.createElement("input")
        consentCheckbox.setAttribute("type", "checkbox")
        consentCheckbox.setAttribute("id", entry.id)
        consentCheckbox.setAttribute("name", entry.id)
        if (self.userProfile.consents[entry.id]){
          consentCheckbox.setAttribute("checked", "")
        }

        const consentLabel = document.createElement("label")
        consentLabel.setAttribute("for", entry.id)
        consentLabel.textContent = "\u2007I consent"
        
        // Add event listener to the checkbox
        consentCheckbox.addEventListener("change", function() {
          const upData = {
            emailAddr: self.emailAddr,
            authToken: self.authToken,
            idConsent: entry.id,
            tf: consentCheckbox.checked
          }
          console.log("upData:", upData)

          // Send data to the API
          fetch("/api/updateConsent", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(upData)
          })
          .then(response => response.json())
          .then(data => {
            console.log("Success:", data)
          })
          .catch((error) => {
            console.error("Error:", error)
          })
        })

        consentLi.appendChild(consentCheckbox)
        consentLi.appendChild(consentLabel)
        consentUl.appendChild(consentLi)

        // Add line breaks
        consentUl.appendChild(document.createElement("br"))

        featureDiv.appendChild(consentUl)
      }

      // Link Button
      const link = document.createElement("a")
      link.setAttribute("href", entry.toolLink)
      link.setAttribute("target", "_blank")
      link.setAttribute("class", "btn btn-lg btn-yellow")
      link.textContent = `Go to ${entry.name}`
      featureDiv.appendChild(link)

      // Append feature div to container div
      containerDiv.appendChild(featureDiv)
    })

    // Append the container to the body
    // document.body.appendChild(containerDiv)
  }
  
  
  get_parameter_by_name(name){
    let match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '))
  }
  
  
  // Stopped using this for now to avoid confusing users.
  scrub_parameters_from_url(){
    if (window.history.pushState){
      let newUrl = new URL(window.location.href)
      newUrl.search = ""
      // console.log("newUrl:", newUrl)
      window.history.pushState(
        {
          "path": newUrl.href
        }, "", newUrl.href
      )
    }
  }
  
  
  make_labelled_textarea(appendEl, idInput, labelText, placeholder = labelText, valueText = placeholder, rows = 5, cols = 50){
    const div = document.createElement("div")
    div.setAttribute("class", "form-group")
    const label = document.createElement("label")
    label.setAttribute("for", idInput)
    label.setAttribute("class", "col-sm-3 control-label")
    let txt = document.createTextNode(labelText)
    label.appendChild(txt)
    div.appendChild(label)
    const div2 = document.createElement("div")
    div2.setAttribute("class", "col-sm-9")
    const ta = document.createElement("textarea")
    ta.setAttribute("id", idInput)
    ta.setAttribute("class", "form-control")
    ta.setAttribute("rows", rows)
    ta.setAttribute("cols", cols)
    txt = document.createTextNode(valueText)
    ta.appendChild(txt)
    ta.setAttribute("placeholder", placeholder)
    div2.appendChild(ta)
    div.appendChild(div2)
    appendEl.appendChild(div)
  }
  
  
  make_labelled_input(appendEl, idInput, inputType, labelText, placeholder = labelText, valueText = placeholder){
    const div = document.createElement("div")
    div.setAttribute("class", "form-group")
    const label = document.createElement("label")
    label.setAttribute("for", idInput)
    label.setAttribute("class", "col-sm-3 control-label")
    const txt = document.createTextNode(labelText)
    label.appendChild(txt)
    div.appendChild(label)
    const div2 = document.createElement("div")
    div2.setAttribute("class", "col-sm-9")
    const input = document.createElement("input")
    input.setAttribute("id", idInput)
    input.setAttribute("class", "form-control")
    input.setAttribute("type", inputType)
    input.setAttribute("value", valueText)
    input.setAttribute("placeholder", placeholder)
    div2.appendChild(input)
    div.appendChild(div2)
    appendEl.appendChild(div)
    
    // <div class="form-group">
    //   <label for="name" class="col-sm-3 control-label">Name<sup>*</sup></label>
    //   <div class="col-sm-9">
    //     <input type="text" class="form-control" id="name" placeholder="John Doe" required>
    //     <div class="help-block with-errors pull-right"></div>
    //     <span class="form-control-feedback" aria-hidden="true"></span>
    //   </div>
    // </div>
    
  }


  export_csv_file(objArray, fnam){
    // Adapted from https://gist.github.com/dannypule/48418b4cd8223104c6c92e3016fc0f61
    // Something like
    // const objArray = [
    //   {
    //     "name": "Full name",
    //     "age": "Age (years)"
    //   },
    //   {
    //     "name": "Clarence Caruthers",
    //     "age": 70
    //   },
    //   {
    //     "name": "Elephant, Nelly",
    //     "age": 23
    //   }
    // ]
    
    // Convert Object to JSON
    const csvStr = this.obj2csv_str(objArray)

    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
      navigator.msSaveBlob(blob, fnam)
    }
    else {
      const link = document.createElement("a")
      if (link.download !== undefined) { // feature detection
        // Browsers that support HTML5 download attribute
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", fnam)
        link.style.visibility = "hidden"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    }
  }
  
  
  obj2csv_str(objArray){
    let str = ""
    for (let i = 0; i < objArray.length; i++){
      let line = "";
      for (let index in objArray[i]){
        line += objArray[i][index].replace(/,/g, '') // remove commas to avoid errors
        line += ","
      }
      str += line.slice(0, line.length - 1) + "\r\n"
    }
    return str
  }
  
}


class Auth {
  constructor(){
    self = this
    this.util = new Util()
    
    document.getElementById("signin").addEventListener("click", function(e){
      e.preventDefault()
      self.load_sign_in_window()
      
    })
  }
  
  
  load_sign_in_window(){
    // console.log("TIME TO LOAD SIGNIN WINDOW!!")
    self.util.remove_children_of_element("mainEvent")
    const me = document.getElementById("mainEvent")
    // Create the elements
    const spaceTop1 = document.createElement('div');
    spaceTop1.className = 'space-top';

    const heading = document.createElement('h1');
    heading.textContent = 'Sign in to TSMLP!';

    const spaceTop2 = document.createElement('div');
    spaceTop2.className = 'space-top';

    // Append the elements to the mainEvent div
    me.appendChild(spaceTop1);
    me.appendChild(heading);
    me.appendChild(spaceTop2);
    
    // Create the form element
    const form = document.createElement('form');
    form.id = "signinForm"
    form.className = 'mui-form';

    // Create the legend element
    const legend = document.createElement('legend');
    legend.id = "signinLegend"
    legend.textContent = 'Use this form to send an authentication link to your email address.';

    // Create the div for the textfield
    const textFieldDiv = document.createElement('div');
    textFieldDiv.className = 'mui-textfield';

    // Create the input element
    const input = document.createElement('input');
    input.id = "usrEmail"
    input.type = 'text';
    input.placeholder = 'Email address';

    // Append the input to the textfield div
    textFieldDiv.appendChild(input);

    // Create the button element
    const button = document.createElement('button');
    button.id = "signinSubmit"
    button.type = 'submit';
    button.className = 'mui-btn mui-btn--raised';
    button.textContent = 'Send';

    // Append all elements to the form
    form.appendChild(legend);
    form.appendChild(textFieldDiv);
    form.appendChild(button);

    // Append the form to the 'me' div
    me.appendChild(form);
    
    // Call the generate_token() endpoint.
    document.getElementById("signinSubmit").addEventListener("click", function(e){
      e.preventDefault()
      console.log("ATTEMPTING TO CALL GENERATE_TOKEN!!")
      self.generate_token(self)
    })
  }
  
  
  url_token(_in){
    const self = _in
    // self.load_signin()
    // Handle use of a token.
    const authToken = self.get_parameter_by_name("tkn")
    if (authToken !== null){
      // self.scrub_parameters_from_url()
      const upData = {
        "authToken": authToken
      }
      console.log("upData:", upData)
      fetch("/api/auth", {
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
          if (downData.msg === "Authentication successful!"){
            console.log("downData:", downData)
            self.emailAddr = downData.emailAddr
            self.authToken = downData.authToken
            self.userProfile = downData.userProfile
            
            myClient.load_user_docs(self)
          }
        }
      )

      // return
    }
    
    // IF SOME STUFF IS LOADED FROM BACk-END BUT CONTENT DEPENDENT ON AUTH, HERE IS A GOOD PLACE TO HANDLE THAT.
    // self.blog.add_blog(authToken)
    
    // Handle use of csv.
    // const csvLink = self.get_parameter_by_name("csv")
    // if (csvLink !== null){
    //   self.scrub_parameters_from_url()
    //   const upData = {
    //     "magicLink": csvLink
    //   }
    //   console.log("upData:", upData)
    //   fetch("/csv/auth", {
    //     method: "POST",
    //     body: JSON.stringify(upData),
    //     headers: { "Content-Type": "application/json" }
    //   })
    //   .then(
    //     function(res){
    //       console.log("res:", res)
    //       return res.json()
    //     }
    //     // res => res.json()
    //   )
    //   .then(
    //     function(downData){
    //     // downData => {
    //       console.log(downData)
    //       if (downData.msg === "Authentication successful!"){
    //         console.log(downData.userProfiles)
    //         self.export_csv_file(
    //           downData.userProfiles,
    //           "ccc.csv"
    //         )
    //       }
    //     }
    //   )

    //   return
    // }
    
    
  }
  
  
  check_token(_in){
    const self = _in
    const tkn = document.getElementById("usrEmail").value
    
    const upData = {
      "emailAddr": self.emailAddr,
      "authToken": tkn
    }
    console.log("upData from check_token():", upData)
    fetch("/api/checkToken", {
      method: "POST",
      body: JSON.stringify(upData),
      headers: { "Content-Type": "application/json" }
    })
    .then(res => res.json())
    .then(downData => {
      console.log("downData:", downData)
      self.emailAddr = downData.emailAddr
      self.authToken = downData.authToken
      self.userProfile = downData.userProfile
      // WE DON'T HAVE THE DOCS LOADING YET.
      // self.docs = downData.docs
      
      myClient.load_user_docs(self)
      
    })
  }
  
  
  generate_token(_in){
    const self = _in
    const ea = document.getElementById("usrEmail").value
    // Get the characters following the @ symbol and check they match @miami.edu.
    // Get the character before the @ symbol and check it's a number. Otherwise it's not a caneid.
    // const eaSplit = ea.split("@")
    // if (
    //   eaSplit[1] !== "miami.edu" ||
    //   isNaN(parseInt(eaSplit[0][eaSplit[0].length - 1]))
    // ){
    //   alert("Use your Cane ID followed by \"@miami.edu\".")
    //   return
    // }
    
    const upData = {
      "emailAddr": ea
    }
    fetch("/api/authToken", {
      method: "POST",
      body: JSON.stringify(upData),
      headers: { "Content-Type": "application/json" }
    })
    .then(res => res.json())
    .then(downData => {
      console.log("downData:", downData)
      // Remove the form and display a message instead.
      if (downData.msg === "Link generated and email sent to user."){
        self.emailAddr = downData.emailAddr
        console.log("self.emailAddr:", self.emailAddr)
        const lbl = document.getElementById("signinLegend")
        self.util.remove_children_of_element("signinLegend")
        
        
        let txt = document.createTextNode(
          "An email containing an authentication token has been sent to " + ea + ". " +
          "Paste the token below and click “Go!”"
        )
        lbl.appendChild(txt)
        const ue = document.getElementById("usrEmail")
        ue.value = ""
        ue.setAttribute("placeholder", "Paste your auth code here.")
        
        // Create the button element
        const button = document.createElement('button');
        button.type = 'submit';
        button.className = 'mui-btn mui-btn--raised';
        button.textContent = 'Go!';
        
        // Call the check_token() endpoint.
        button.addEventListener("click", function(e){
          e.preventDefault()
          console.log("ATTEMPTING TO CALL CHECK_TOKEN!!")
          self.check_token(self)
        })
        
        // Remove one button and add another.
        const form = document.getElementById("signinForm")
        const oldButton = document.getElementById("signinSubmit")
        oldButton.remove()
        form.appendChild(button)
        
        // txt = document.createTextNode("Go!")
        // btn.appendChild(txt)
        
        // div.appendChild(self.util.make_a_break())
      }
      else {
        alert(
          "Not a registered address. Email musicaialg2048@gmail.com to request access."
        )
      }
      // window.scrollTo({ top: 0, behavior: "smooth" })
    })
  }
  
}


class Util {
  constructor(){
    
  }
  
  
  make_a_break(){
    let br = document.createElement("br")
    return br
  }
  
  
  remove_children_of_element(id){
    const el = document.getElementById(id)
    while(el.firstChild){
      el.removeChild(el.firstChild)
    }
  }
  
}


const myClient = new MyClient()
myClient.auth.url_token(myClient)
