/**
 * This is the main Node.js server script for your project
 * Check out the two endpoints this back-end API provides in fastify.get and fastify.post below
 */

const path = require("path")
const fs = require("fs")
const { pipeline } = require('stream');
const util = require("util")
const pump = util.promisify(pipeline)


// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false,
});

fastify.register(require('fastify-multipart'))

// ADD FAVORITES ARRAY VARIABLE FROM TODO HERE


// Setup our static files
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/", // optional: default '/'
});

// Formbody lets us parse incoming forms
fastify.register(require("@fastify/formbody"));

// View is a templating manager for fastify
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
});
// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

/**
 * Our home page route
 *
 * Returns src/pages/index.hbs with data built into it
 */
let siteVisits = 0
fastify.get("/", function (request, reply) {
  // params is an object we'll pass to our handlebars template
  // siteVisits = siteVisits + 1
  siteVisits++
  console.log("siteVisits:", siteVisits)
  
  if(request.headers["x-forwarded-for"]){
    const ip = request.headers['x-forwarded-for'].split(",")[0]
    console.log("ip:", ip)
  }
  
  let params = { seo: seo }

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/pages/index.hbs", params);
});

/**
 * Our routes
 */
fastify.register(require('./server/auth'))
fastify.register(require('./server/jobs'))


// //******** Upload file w/o Client side. ************//
// fastify.post("/fileupload", async function(req, reply) {
//   const files = await req.saveRequestFiles()
  
//   // console.log(files[0])
//   // files[0].filepath
//   // files[0].fieldname
//   // files[0].filename
//   // files[0].encoding
//   // files[0].mimetype
//   // files[0].fields // other parsed parts
//   console.log(files[0].filepath)
//   console.log("uploadDir", uploadDir)

//   fs.copyFile(files[0].filepath, path.join(uploadDir, "blah1.mid"), function(err){
    
//     if (err) throw err;
//     reply.send("File uploaded and moved!")
//   })
// })

//******** Upload file with Client side. ************//
fastify.post("/fileupload", async function(req, reply) {
  const files = await req.file()
  const uploadDir = path.join(__dirname, 'public', 'midi');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log(`Created directory: ${uploadDir}`);
  }
  console.log("uploadDir", uploadDir)
  
  const filePath = path.join(uploadDir, files.filename)

  // await pump(files.file, fs.createWriteStream(filePath), function(err){
  //   if (err){
  //     console.error(err);
  //     return reply.status(500).json({ message: 'File upload failed', error: err.message });
  //   } 
  //   reply.status(200).json({
  //           message: 'File uploaded successfully',
  //           file: filePath
  //       });
  // })
  try {
    await pump(files.file, fs.createWriteStream(filePath))
    reply.code(200).send({
        message: 'File uploaded successfully',
        file: filePath
    });
    
  } catch(err) {
    console.error(err)
    reply.code(500).send({ message: 'File upload failed', error: err.message });  
  }
  
})


// Run the server and report out to the logs
fastify.listen(
  { port: process.env.PORT, host: "0.0.0.0" },
  function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
  }
);

