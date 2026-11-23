# TSMLP

## Backing up this site

Please do a weekly backup of this site. Go to Tools (bottom icon bar) -> Import/Export -> Download Project. It can go in your Master's OneDrive folder.

In the zip that downloads, the data layer will be hidden in .data, but it is possible to unhide it by renaming it in Terminal, if you need to recover a file.

If you ever completely lose the site or its data layer, a way to get the data layer back in is to:

1. Zip your local backup of just the data layer;

2. Put it somewhere on the Web using FileZilla;

3. Use

```
wget "path-to-data-layer-zip"
```

from the Glitch terminal, inside the .data folder;

4. Run `unzip` from the Glitch terminal.

## The data layer

The data layer consists of one important file in particular:

- users -> legit_users.json

To navigate to the .data folder in the terminal, simply type:

`cd .data`

To view any hidden files or folders, use:
`ls -al`

legit_users.json is an array of email addresses for each user who has an account on TSMLP.

The other important thing to know about the back-end is that the folder

- users -> sessions_profiles

contains subfolders with all users data. For example, sessions_profiles -> 1c6 -> 1c6f5... contains an index.json file with the following JS object:

```
{
  "id": "1c6f5...",
  "email": "address@gmail.com",
  "authToken": "the-1",
  "stampCreate": 1727885548891,
  "userProfile": {
    "name": null,
    "imageLink": null,
    "skills": null,
    "description": null,
    "uploads": [
      "236ff",
      "fewf5"
    ],
    "visits": [
      1727885548891
    ]
  }
}
```

So each user's data are stored in a single index.json file. I use the first three characters of their UUIDs to reduce the number of folders at the top level of sessions_profiles. It's OK if two or more users happen to have coincident 3-character beginnings to their UUIDs: there will just be multiple subfolders in such a directory, with one index.json file per subfolder. A function called `get_all_user_data()` in server -> auth.js does a lot of heavy lifting: it iterates over sessions_profiles and subfolders therein, pulling user data into one variable, `allUserData`.

An alternative approach would be to store all users' data in one JSON file, but this is risky because if multiple people are using the site at the same time, there might be a file write request while the file is still open due to another request, causing data corruption. "Database concurrency is the ability of a database to allow multiple users or applications to access data simultaneously without affecting the integrity of the data."

The above is not a proper database solution -- it's still only text files on disk -- but it's more robust to data corruption, because hopefully if one person's data get corrupted, it doesn't affect other users. There is a try-catch in `get_all_user_data()` that should warn about any corrupt data and prevent it being pulled into `allUserData`.

### Adding and removing users

There are two scripts in server -> scripts that are useful in this respect: add_users.json and remove_users.json. Typical usage goes like this:

```
// cd to server/scripts
// so that the dataLayerRoot is defined correctly.
node add_users -e '["blah@meh.com", "meh@blij.co.uk"]'
```

and

```
// cd to server/scripts
// so that the dataLayerRoot is defined correctly.
node remove_users -e '["blah@meh.com", "meh@blij.co.uk"]'
```

`find()` returns undefined for unfound elements, not -1. Use undefined as the check instead. -1 applies only with `findIndex().`

### Security

Apart from the hidden .data folder, the other security aspect to be aware of is the .env file, which is where we keep all the site's secrets. GitHub repos are set up such that the .data folder and .env file should never be committed to the repo.
