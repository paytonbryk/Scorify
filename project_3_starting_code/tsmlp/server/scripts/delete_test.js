(async () => {
  const si = require('search-index')
  const db = await si({
    name: '../../.data/TMP-DELETE',
    storeVectors: true
  })

  console.log('\nADDING ->')
  await db.PUT([
    {
      _id: 1,
      bandName: 'The Beatles',
      description: 'The nice boys of pop'
    }, {
      _id: 'two',
      bandName: 'The Rolling Stones',
      description: 'The bad boys of rock'
    }, {
      _id: 3,
      bandName: 'The Who',
      description: 'Nearly as good as Led Zeppelin'
    }
  ], { storeVectors: true }).then(console.log)

  console.log('\nVERIFYING ->')
  await db.SEARCH(["Zeppelin"]).then(console.log)
  // await db.SEARCH(["Zeppelin"]).then(function(sr){ console.log(sr.RESULT[0]._match) })
  // await db.DOCUMENTS(3).then(console.log)

  console.log('\nDELETING ->')
  await db.DELETE(3).then(console.log)

  console.log('\nCONFIRM DELETE ->')
  await db.SEARCH(["Zeppelin"]).then(console.log)
  // await db.SEARCH(["Zeppelin"]).then(function(sr){ console.log(sr.RESULT[0]._match) })
  // await db.DOCUMENTS(3).then(console.log)

})()