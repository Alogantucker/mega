const { Storage, File } = require("megajs");
// import variables from local env file
require("dotenv").config({ path: "./my.env" }); // replace with your own .env file path
const fs = require("fs");

const email = `${process.env.MEGA_EMAIL}`; // replace with your mega email; my email is stored in my.env file
const password = `${process.env.MEGA_PASSWORD}`; // replace with your mega password; my password is stored in my.env file

const downloadFolder = `${process.env.DownloadFolderPath}`; // replace with your desired download folder
const fileName = "rec_n.06_21.wav"; // replace with the file you would like to download from mega

// working example
async function startTest(){
    const exploredFolders = new Set();

async function downloadFileByName(folder, targetFileName) {
  const folderUniqueID = folder.nodeId; // Use the folder's unique identifier as the folder path
  if (
    exploredFolders.has(folderUniqueID) &&
    folderUniqueID !== Array.from(exploredFolders)[0]
  ) {
    // Skip this folder if it has already been explored
    return;
  }

  try {
    if (!folder.directory && folder.name === targetFileName) {
      // Download the file and save it
      const data = await folder.downloadBuffer();
      const filePath = `${downloadFolder}/${targetFileName}`;
      fs.writeFileSync(filePath, data);
      console.log("Download and save successful!");
      return;
    }
  } catch (error) {
    console.error("Error X:", error);
  }

  // Load folder attributes if not available and not the root folder
  try {
    if (!folder.attributes && folder.name !== "Cloud Drive") {
      await folder.loadAttributes();
    }
  } catch (error) {
    console.error("Error loading folder attributes:", error);
  }

  // Mark the current folder as explored
  exploredFolders.add(folderUniqueID);

  // Check if the folder has any children
  if (!folder.children || folder.children.length === 0) {
    // If the folder is empty, go up to the parent folder (one level up)
    if (folder.parent) {
      await downloadFileByName(folder.parent, targetFileName);
    }
    return; // Exit the function to prevent further exploration
  }

  // Check if the target file exists in this folder
  const file = folder.children.find((file) => file.name === targetFileName);
  if (file) {
    // Download the file and save it
    const data = await file.downloadBuffer();
    const filePath = `${downloadFolder}/${targetFileName}`;
    fs.writeFileSync(filePath, data);
    console.log("Download and save successful!");
    return;
  }

  // If the target file is not found in this folder, explore its subfolders
  for (const child of folder.children) {
    if (child.directory) {
      await downloadFileByName(child, targetFileName);
    }
  }
}

async function megaLogin2(email, password) {
  const mega = new Storage({ email, password });

  try {
    await mega.login();

    // Get the root folder
    const rootFolder = mega.root;
    console.log("Root folder:", rootFolder);

    // Start searching for the file recursively
    await downloadFileByName(rootFolder, fileName);
  } catch (error) {
    console.error("Error:", error);
  }
}

megaLogin2(email, password);
}





// Create a test function to log in and check the result
function testLogin1() {
  const mega = new Mega({ email, password });

  mega.login((err) => {
    if (err) {
      console.error("Login failed:", err);
    } else {
      console.log("Login successful!");

      // File node ID of the file you want to download (replace with your file's node ID)
      const fileNodeId = "uiBz2ldZokEnEG6HSzNVeIF5LNpnXUuvsbIzjOiqM-s";

      // Download folder path (replace with your desired download folder)

      console.log("Mega Object");
      console.dir(mega, { depth: null });
      console.log("Mega Root");
      console.dir(mega.root, { depth: null });

      mega.findFile(fileNodeId, (err, file) => {
        if (err) {
          console.error("Error fetching file node:", err);
        } else {
          // Start the download
          file.download(downloadFolder, (err) => {
            if (err) {
              console.error("Download failed:", err);
            } else {
              console.log("Download successful!");
            }
          });
        }
      });
    }
  });
}

// Call the testLogin function to run the test
//   testLogin();

// works, downloading by url
async function testLogin2() {
  const mega = new Storage({ email, password });

  mega.login(async (err) => {
    if (err) {
      console.error("Login failed:", err);
    } else {
      console.log("Login successful!");

      const folder = File.fromURL(
        "https://mega.nz/folder/aQ5GTCbT#UnAKXAXDgramzEOmnPmd5A"
      );

      // Load folder attributes
      await folder.loadAttributes();

      // Download a file from the folder
      const file = folder.children.find((file) => file.name === fileName);
      const data = await file.downloadBuffer();
      console.log(data);
      // Save the Buffer to a file on your computer
      const filePath = `${downloadFolder}/${fileName}`;
      fs.writeFileSync(filePath, data);

      console.log("Download and save successful!");
    }
  });
}

// testLogin2();

async function downloadFileByName1(folder, targetFileName) {
  try {
    if (!folder.directory && folder.name === targetFileName) {
      // Download the file and save it
      const data = await file.downloadBuffer();
      const filePath = `${downloadFolder}/${targetFileName}`;
      fs.writeFileSync(filePath, data);
      console.log("Download and save successful!");
      return;
    }
  } catch (error) {
    console.error("Error X :", error);
  }
  // Load folder attributes
  try {
    if (!folder.attributes && !folder.name === `Cloud Drive`) {
      // Load folder attributes if not available
      await folder.loadAttributes();
    }
  } catch (error) {
    console.error("Error loading folder attributes:", error);
  }

  // Check if the target file exists in this folder
  const file = folder?.children?.find((file) => file.name === targetFileName);
  if (file) {
    // Download the file and save it
    const data = await file.downloadBuffer();
    const filePath = `${downloadFolder}/${targetFileName}`;
    fs.writeFileSync(filePath, data);
    console.log("Download and save successful!");
    return;
  }

  // If the target file is not found in this folder, explore its subfolders
  for (const child of folder.children) {
    if (child.directory) {
      await downloadFileByName1(child, targetFileName);
    }
  }
}

async function downloadFileByName2(
  folder,
  targetFileName,
  parentFolder = null
) {
  try {
    if (!folder.directory && folder.name === targetFileName) {
      // Download the file and save it
      const data = await folder.downloadBuffer();
      const filePath = `${downloadFolder}/${targetFileName}`;
      fs.writeFileSync(filePath, data);
      console.log("Download and save successful!");
      return;
    }
  } catch (error) {
    console.error("Error X:", error);
  }

  // Load folder attributes if not available
  try {
    if (!folder.attributes && folder.name !== "Cloud Drive") {
      await folder.loadAttributes();
    }
  } catch (error) {
    console.error("Error loading folder attributes:", error);
  }

  // If the target file is not found in this folder, explore its subfolders
  let childrenToExplore = folder?.children?.filter((child) => child.directory);
  while (childrenToExplore.length === 0 && parentFolder) {
    // No children to explore in the current folder, move back to the parent
    folder = parentFolder;
    parentFolder = folder.parent;
    childrenToExplore = folder.children.filter((child) => child.directory);
  }

  for (const child of childrenToExplore) {
    await downloadFileByName2(child, targetFileName, folder);
  }
}
