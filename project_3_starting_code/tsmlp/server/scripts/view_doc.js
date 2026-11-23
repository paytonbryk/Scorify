(async () => {
  const fs = require("fs")
  const si = require("search-index")
  const db = await si({ name: "./../../.data/TMP-SEARCH" })
  // console.log("db:", db)
  
  // await db.ALL_DOCUMENTS(10)
  // await db.DOCUMENT_COUNT()
  // .then(function(docs){ console.log("docs:", docs) })
  
  await db.DOCUMENTS("3e8ef2d4-04d9-4da0-a1b8-e9c59eda7390")
  .then(function(docs){ console.log("docs:", docs) })
  
  
})()