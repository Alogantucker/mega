const { Storage, File } = require("megajs");
// import variables from local env file
require("dotenv").config({ path: "./my.env" }); // replace with your own .env file path
const fs = require("fs").promises;
const path = require("path");
const { Readable } = require("stream"); // Add this import for the Readable class

const { execSync } = require("child_process");
const os = require("os");
const login = require("./login");
const get = require("./get.js");
const download = require("./download.js");
const upload = require("./upload.js");

const email = `${process.env.MEGA_EMAIL}`; // replace with your mega email; my email is stored in my.env file
const password = `${process.env.MEGA_PASSWORD}`; // replace with your mega password; my password is stored in my.env file

const downloadFolder = `${process.env.DownloadFolderPath}`; // replace with your desired download folder
const fileName = "rec_n.06_21.wav"; // replace with the file you would like to download from mega
// const fileName = "Rental"; // 55 results, like 10 min of getting buffers without downloads
// const fileName = "bestie"

// Newest Working Code

async function megaLogin(email, password) {
  const mega = new Storage({ email, password });

  try {
    await mega.login();
    console.log("Mega Client Login successful!");
    return mega;
  } catch (error) {
    console.error("Error:", error);
  }
}

async function findFileByName(folder, targetFileName) {
  const exploredFolders = new Set(); // Define the set locally within findFileByName
  const foundData = [];

  async function exploreFolder(folder) {
    const folderUniqueID = folder.nodeId;
    if (
      exploredFolders.has(folderUniqueID) &&
      folderUniqueID !== Array.from(exploredFolders)[0]
    ) {
      return;
    }

    try {
      const matchingFiles = folder?.children?.filter(
        (file) => file?.name?.split(".")[0] === targetFileName
      );
      if (matchingFiles) {
        for (const file of matchingFiles) {
          if (!file.directory) {
            const data = {
              file,
              link: file.shareURL || (await file.link()),
              downloadBuffer: await file.downloadBuffer(),
              name: file.name,
              nodeId: file.nodeId,
              type: `${file.directory ? "Folder" : "File"}`,
            };
            foundData.push(data);
          }
        }
      }
    } catch (error) {
      console.error("Error X:", error);
    }

    try {
      if (!folder.attributes && folder.name !== "Cloud Drive") {
        await folder.loadAttributes();
      }
    } catch (error) {
      // console.error('Error loading folder attributes:', error);
    }

    exploredFolders.add(folderUniqueID);

    if (folder.children && folder.children.length > 0) {
      for (const child of folder.children) {
        if (child.directory) {
          await exploreFolder(child);
        }
      }
    }
  }

  await exploreFolder(folder);
  return foundData;
}

// Function to check available storage space and delete files if needed
function checkStorageSpace(spaceNeeded) {
  function getAvailableSpace() {
    if (os.platform() === "darwin") {
      // tested and working
      try {
        const dfOutput = execSync("df -k /").toString();
        const lines = dfOutput.trim().split("\n");
        if (lines.length > 1) {
          // Skip the header line and get the available space value in kilobytes
          const data = lines[1].split(/\s+/);
          const availableSpaceInKb = parseInt(data[3]);
          const availableSpaceInBytes = availableSpaceInKb * 1024;
          return availableSpaceInBytes;
        } else {
          throw new Error("Failed to get disk space information on macOS.");
        }
      } catch (err) {
        console.error("Error:", err);
        return null;
      }
    } else if (os.platform() === "win32") {
      // untested
      try {
        const dfOutput = execSync(
          "wmic logicaldisk get FreeSpace,Size /Format:csv"
        ).toString();
        const lines = dfOutput.trim().split("\n");
        if (lines.length > 1) {
          const data = lines[1].split(",");
          const availableSpaceInBytes = parseInt(data[0].trim());
          return availableSpaceInBytes;
        } else {
          throw new Error("Failed to get disk space information on Windows.");
        }
      } catch (err) {
        console.error("Error:", err);
        return null;
      }
    } else if (os.platform() === "linux") {
      // untested
      try {
        const dfOutput = execSync("df -B1 --output=avail /").toString();
        const availableSpaceInBytes = parseInt(dfOutput.trim().split("\n")[1]);
        return availableSpaceInBytes;
      } catch (err) {
        console.error("Error:", err);
        return null;
      }
    } else {
      console.error("Platform not supported.");
      return null;
    }
  }

  const availableSpace = getAvailableSpace();
  if (availableSpace !== null) {
    console.log("Available storage space (in bytes):", availableSpace);
    console.log(
      "Available storage space (in GB):",
      availableSpace / (1024 * 1024 * 1024)
    );
  }

  if (availableSpace < spaceNeeded) {
    // Delete files in the download folder until enough space is available
    const files = fs.readdirSync(downloadFolder);
    files.sort(
      (a, b) =>
        fs.statSync(`${downloadFolder}/${a}`).ctimeMs -
        fs.statSync(`${downloadFolder}/${b}`).ctimeMs
    );

    for (const file of files) {
      const fileStats = fs.statSync(`${downloadFolder}/${file}`);
      fs.unlinkSync(`${downloadFolder}/${file}`);
      availableSpace += fileStats.size;

      if (availableSpace >= spaceNeeded) {
        break;
      }
    }
  }

  return availableSpace >= spaceNeeded;
}

// Function to calculate total space needed for all data in the foundData array
function getTotalSpaceNeeded(dataArray) {
  return dataArray.reduce((total, data) => total + data.length, 0);
}

// Function to save the data to a file with a unique name
function saveFileWithUniqueName(
  filePath,
  data,
  counter = 0,
  originalExtension
) {
  const fullFilePath =
    counter === 0
      ? filePath
      : `${filePath.replace(/(\.[^.]+$)/, "")}(${counter})$1`;
  if (fs.existsSync(fullFilePath)) {
    return saveFileWithUniqueName(
      filePath,
      data,
      counter + 1,
      originalExtension
    );
  } else {
    // Save the file with the original extension if it doesn't exist
    fs.writeFileSync(fullFilePath, data);
    console.log(`Download and save successful: ${fullFilePath}`);
  }
}

// Function to determine the file extension based on the magic number in the data
async function getFileExtension(data) {
  const fileTypeModule = await import("file-type");
  const type = await fileTypeModule.fileTypeFromBuffer(data);
  // type ex. {ext: 'mp3', mime: 'audio/mpeg'}
  if (type) {
    return `.${type.ext}`;
  } else {
    return ".dat"; // Default to .dat if the file type is not recognized
  }
}

function getFileNameFromContentDisposition(data) {
  const contentDisposition = data
    .toString("utf8")
    .match(/Content-Disposition:.*filename="([^"]+)"/);
  if (contentDisposition && contentDisposition.length > 1) {
    return contentDisposition[1];
  } else {
    return null;
  }
}

async function downloadFileByName(mega, targetFileName) {
  // only reload after making changes to the mega not through the code
  // await mega.reload();
  let foundData = [];

  try {
    // Get the root folder
    const rootFolder = mega.root;

    // Call the function to start the search process and find the files by name
    foundData = await findFileByName(rootFolder, targetFileName);

    // Calculate total space needed for all the data in the foundData array
    const totalSpaceNeeded = getTotalSpaceNeeded(foundData);

    // Check storage space before downloading
    const isEnoughSpace = checkStorageSpace(totalSpaceNeeded);

    if (!isEnoughSpace) {
      console.log("Free Up Storage On Device To Download Media");
      return;
    }

    // Download and save the data to the download folder
    for (let i = 0; i < foundData.length; i++) {
      const fileExtension = await getFileExtension(foundData[i]);
      const fileNameWithoutExtension =
        getFileNameFromContentDisposition(foundData[i]) || targetFileName;
      const filePath =
        i === 0
          ? `${downloadFolder}/${fileNameWithoutExtension}${fileExtension}`
          : `${downloadFolder}/${fileNameWithoutExtension}_${i}${fileExtension}`;
      saveFileWithUniqueName(filePath, foundData[i], 0, fileExtension);
    }
    return console.log("All files downloaded and saved successfully!");
  } catch (error) {
    console.error("Error:", error);
  }
}

// Usage:
async function Go() {
  try {
    // const mega = await megaLogin(email, password)
    const mega = await login();

    await downloadFileByName(mega, fileName);
  } catch (err) {
    return console.log(err);
  }
}

// Go();

// Attempting uploading a file
async function Go2() {
  try {
    console.log("running");
    const mega = await megaLogin(email, password);
    const filePath = `${process.env.Resume_File_Path}`;
    /**
     * The folderNames array represents the hierarchy of folder names to traverse
     * when searching for the target folder. Each element in the array corresponds
     * to a level of folder nesting.
     *
     * Example:
     * If the target folder path is "star/green/taxes", the folderNames array would be:
     * ['star', 'green', 'taxes']
     *
     * @type {string[]}
     */
    const folderNames = ["Node Test Folder"]; // Temp is the folder name I want to upload the file too
    await uploadFileToFolder(filePath, mega, folderNames);

    // await uploadFileWithOptions(filePath, mega); // works saving a file to the root of mega account
  } catch (err) {
    console.error(err);
  }
}
// Go2();
/**
 * Recursively searches the Mega root for a folder with the given name and, optionally, a parent folder name.
 * If a parent folder name is provided, the function searches within the specified parent folder.
 *
 * @param {File} currentFolder - The current folder being explored.
 * @param {string} targetFolderName - The name of the folder to find.
 * @param {string} [parentFolderName] - The name of the parent folder within which to search for the target folder.
 * @param {Set} [exploredFolders=new Set()] - A set to track explored folders and avoid infinite loops.
 * @returns {File|null} The found folder or null if not found.
 */
async function findFolderByName(rootFolder, folderNames) {
  // working function
  async function exploreFolder(
    folder,
    folderNames,
    exploredFolders = new Set()
  ) {
    const folderUniqueID = folder.nodeId;

    if (exploredFolders.has(folderUniqueID)) {
      return null; // Folder already explored at this level, exit
    }

    try {
      const matchingSubfolders = folder?.children?.filter(
        (subfolder) =>
          subfolder?.name === folderNames[0] && subfolder?.directory
      );

      if (matchingSubfolders.length > 0) {
        if (folderNames.length === 1) {
          return matchingSubfolders[0]; // Found the desired folder
        } else {
          const result = await exploreFolder(
            matchingSubfolders[0],
            folderNames.slice(1),
            new Set([...exploredFolders, folderUniqueID])
          );
          if (result) {
            return result;
          }
        }
      }
    } catch (error) {
      console.error("Error exploring folder:", error);
    }

    try {
      if (!folder.attributes && folder.name !== "Cloud Drive") {
        await folder.loadAttributes();
      }
    } catch (error) {
      console.error("Error loading folder attributes:", error);
    }

    exploredFolders.add(folderUniqueID);

    const subfolders = folder?.children?.filter((child) => child.directory);
    if (subfolders) {
      for (const subfolder of subfolders) {
        const result = await exploreFolder(
          subfolder,
          folderNames,
          exploredFolders
        );
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  return exploreFolder(rootFolder, folderNames);
}

async function findFolderByName1(rootFolder, folderNames) {
  // working function
  async function exploreFolder(
    folder,
    folderNames,
    exploredFolders = new Set()
  ) {
    const folderUniqueID = folder.nodeId;

    if (exploredFolders.has(folderUniqueID)) {
      return null; // Folder already explored at this level, exit
    }

    try {
      if (folder.name === folderNames[0]) {
        if (folderNames.length === 1) {
          return folder; // Found the desired folder
        } else {
          const subfolderName = folderNames[1];
          const subfolders = folder?.children?.filter(
            (child) => child?.directory
          );
          for (const subfolder of subfolders) {
            if (subfolder.name === subfolderName) {
              const result = await exploreFolder(
                subfolder,
                folderNames.slice(1),
                new Set([...exploredFolders, folderUniqueID])
              );
              if (result) {
                return result;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error exploring folder:", error);
    }

    try {
      if (!folder.attributes && folder.name !== "Cloud Drive") {
        await folder.loadAttributes();
      }
      let folderName = folder.name;
      if (folderName === "Temp") {
        console.log(folder);
      }
    } catch (error) {
      console.error("Error loading folder attributes:", error);
    }

    exploredFolders.add(folderUniqueID);

    const subfolders = folder?.children?.filter((child) => child.directory);
    if (subfolders) {
      for (const subfolder of subfolders) {
        const result = await exploreFolder(
          subfolder,
          folderNames,
          exploredFolders
        );
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  return exploreFolder(rootFolder, folderNames);
}

async function uploadFileToFolder(filePath, mega, folderNames) {
  try {
    const content = await fs.readFile(filePath);

    if (content) {
      const targetFolder = await findFolderByName1(mega.root, folderNames);

      if (targetFolder) {
        const uploadStream = mega.upload({
          target: targetFolder,
          name: path.basename(filePath),
          size: content.length,
          // ... rest of your upload options ...
        });

        const readStream = new Readable();
        readStream.push(content);
        readStream.push(null);
        readStream.pipe(uploadStream);

        return new Promise((resolve, reject) => {
          uploadStream.on("complete", (file) => {
            console.log("The file", file);
            console.log("The file was uploaded!");
            resolve(file);
          });
          uploadStream.on("error", (error) => {
            console.error("Error uploading file:", error);
            reject(error);
          });
        });
      } else {
        console.log(`Target folder not found: ${folderNames.join("/")}`);
      }
    } else {
      console.log(`File does not exist at ${filePath}`);
    }
  } catch (error) {
    console.error("Error reading or uploading file:", error);
    throw error;
  }
}

async function uploadFileWithOptions(filePath, mega) {
  try {
    const content = await fs.readFile(filePath);

    if (content) {
      const uploadStream = mega.upload({
        name: path.basename(filePath),
        size: content.length,
        handleRetries: (tries, error, cb) => {
          if (tries > 8) {
            cb(error);
          } else {
            setTimeout(() => cb(null, true), 1000 * Math.pow(2, tries));
          }
        },
        attributes: {
          description: "This is a sample uploaded file",
          author: "John Doe",
        },
      });

      const readStream = new Readable();
      readStream.push(content); // Add data to the internal queue for users of the stream to consume
      readStream.push(null); // Push null to signal end of stream
      readStream.pipe(uploadStream); // Pipe the data to the upload stream

      return new Promise((resolve, reject) => {
        uploadStream.on("complete", (file) => {
          console.log("The file was uploaded!", file);
          resolve(file);
        });
        uploadStream.on("error", (error) => {
          console.error("Error uploading file:", error);
          reject(error);
        });
      });
    } else {
      console.log(`File does not exist at ${filePath}`);
    }
  } catch (error) {
    console.error("Error reading or uploading file:", error);
    throw error;
  }
}

/////////////////////////////////////////////////////
// OLDER BELOW, disregard

// working example
async function startTest() {
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

async function testAll() {
  // test login
  let mega;
  try {
    mega = await login(email, password);
  } catch (error) {
    console.error("Error login:", error);
    return;
  } finally {
    // TESTED & WORKING
    // test download {fileByName}
    try {
      await download.fileByName(mega, fileName, downloadFolder);
    } catch (error) {
      console.error("Error download {fileByName} :", error);
    } finally {
      // TESTED & WORKING
      // test download {fileByURL}
      try {
        let url = "https://mega.nz/file/qZpFgYBT#YYw_cNC5szcS-JZlDmwMVCKSz6Q2uoibcb29jPM286A"
        // await download.byURL(url, downloadFolder);
      } catch (error) {
        console.error("Error download {fileByURL} :", error);
      } finally {
        // TESTED & WORKING
        // test upload {fileToFolder}
        try {
          await upload.fileToFolder(
            `${process.env.Resume_File_Path}`,
            mega,
            [`Node Test Folder`, `tester`],
            { uploader: `Steve Jobs` }
          );
        } catch (error) {
          console.error("Error upload {fileToFolder} :", error);
        } finally {
          // TESTED & WORKING
          // test download {folderByName}
          try {
            await download.folderByName(mega, "Node Test Folder", downloadFolder);
          } catch (error) {
            console.error("Error download {folderByName} :", error);
          } 
          // finally {
            // NOT WORKING
          //   // test download file {byNodeId}
          //   try {
          //     await download.byNodeId(
          //       mega,
          //       `uiBz2ldZokEnEG6HSzNVeIF5LNpnXUuvsbIzjOiqM-s`,
          //       downloadFolder
          //     );
          //   } catch (error) {
          //     console.error("Error download file {byNodeId} :", error);
          //   } finally {
             // NOT WORKING
          //     // test download folder {byNodeId}
          //     try { // tmp folder within 2012 MBP/Online-Mega (Shared w Brad)/.debris
          //       await download.byNodeId(mega, `TRwwVCjb`, downloadFolder);
          //     } catch (error) {
          //       console.error("Error download file {byNodeId} :", error);
          //     }
          //   }
          // }
        }
      }
      // test upload
    }
  }
}

// testAll()