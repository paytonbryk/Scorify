/**
 * This is the main Node.js server script for your project
 * Check out the two endpoints this back-end API provides in fastify.get and fastify.post below
 */

const path = require("path")
require('dotenv').config()

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false,
})

// Setup our static files
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/", // optional: default '/'
})

// View is a templating manager for fastify
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
})

// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.onrender.com`;
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
})

/**
 * Our routes
 */
// Here's a more complex formulation allowing for exporting of data from auth alongside routes:
const {
  authRouteHandler,
  // allUserData
} = require('./server/auth')
fastify.register(authRouteHandler)
// console.log("allUserData:", allUserData)
// Here's the basic of just getting routes.
// fastify.register(require('./server/auth'))
fastify.register(require('./server/jobs'))
// fastify.register(require('./server/search'))
// fastify.register(require('./server/archive'))
// fastify.register(require('./server/blog'))
// fastify.register(require('./server/contest'))


// Run the server and report out to the logs
fastify.listen(
  { port: process.env.PORT, host: "0.0.0.0" },
  function (err, address){
    if (err) {
      console.error(err)
      process.exit(1)
    }
    console.log(`Your app is listening on ${address}`)
  }
)
