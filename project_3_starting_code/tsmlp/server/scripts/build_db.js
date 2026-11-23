(async () => {
  const fs = require("fs")
  const si = require("search-index")
  const dbNam = "./../../.data/TMP-SEARCH"
  const userSessionsNam = "./../../.data/user_sessions.json"
  const db = await si({ name: dbNam })
  const data = JSON.parse(
    fs.readFileSync(userSessionsNam)
  )
  
  // await db.FLUSH()

  await db.PUT(
    Object.keys(data).map(function(k, idx){
      return {
        "_id": data[k].id,
        "name": data[k].userProfile.name,
        "email": k,
        "roleDept": data[k].userProfile.roleDept,
        "skills": data[k].userProfile.skills,
        "description": data[k].userProfile.description
      }
    })
  )

  console.log('\nSEARCH-ing ->')
  await db.SEARCH(['The']).then(console.log)

  // console.log('\nSEARCH-ing ->')
  // await db.SEARCH(['The', 'Beatles']).then(console.log)

  // console.log('\nSEARCH-ing by using QUERY/SCORE with negation ->')
  // await db.QUERY(
  //   {
  //     NOT: {
  //       INCLUDE: { AND: ['The'] },
  //       EXCLUDE: { AND: ['Beatles'] }
  //     }
  //   },
  //   {
  //     SCORE: 'TFIDF'
  //   }
  // ).then(console.log)
})()