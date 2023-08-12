const fs = require("fs").promises;
const fs2 = require("fs");
const { execSync } = require("child_process");
const os = require("os");
const get = require("./get.js");
const path = require('path');

// WORKS
/**
 * Check available storage space and delete files if needed.
 * @param {number} spaceNeeded - The space needed in bytes.
 * @param {string} downloadFolder - The path to the download folder.
 * @returns {boolean} - Whether enough space is available.
 */
function checkStorageSpace(spaceNeeded, downloadFolder) {

  /**
 * Get available space on the disk.
 * @returns {number|null} - Available space in bytes or null if retrieval failed.
 */
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
      availableSpace / (1024 * 1024 * 1024), "VS Space Needed: ", spaceNeeded / (1024 * 1024 * 1024)
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

// WORKS
/**
 * Calculate the total space needed for all data in the dataArray.
 * @param {Array} dataArray - The array of data objects.
 * @returns {number} - The total space needed in bytes.
 */
async function getTotalSpaceNeeded(dataArray) {

  return dataArray.reduce(async (total, data) => data?.buffer?.length ? total + data?.buffer?.length : total + data?.length, 0);
}

// WORKS
/**
 * Save data to a file with a unique name.
 * @param {string} filePath - The path to the file.
 * @param {Buffer} data - The data to be saved.
 * @param {number} counter - The counter for generating unique names.
 * @param {string} originalExtension - The original extension of the file.
 */
async function saveFileWithUniqueName(
  filePath,
  data,
  counter = 0,
  originalExtension
) {
  const fullFilePath =
    counter === 0
      ? filePath
      : `${filePath.replace(/(\.[^.]+$)/, "")}(${counter})$1`;
      try {
        await fs.access(fullFilePath);
        return await saveFileWithUniqueName(
          filePath,
          data,
          counter + 1,
          originalExtension
        );
      } catch (error) {
        // Save the file with the original extension if it doesn't exist
        await fs.writeFile(fullFilePath, data);
        console.log(`Download and save successful: ${fullFilePath}`);
      }
}


// WORKS
/**
 * Find files by name and download them from Mega.
 *
 * @param {object} mega - The Mega instance.
 * @param {string} targetFileName - The target file name to search for.
 * @param {string} downloadDestination - The local directory to save the downloaded files.
 * @param {object} rootFolder - The root folder to start the search from.
 */
async function fileByName(
  mega,
  targetFileName,
  downloadDestination,
  rootFolder
) {
  // TODO: Uncomment the following line to reload Mega (if needed).
  // await mega.reload();

  try {
    // Get the root folder
    rootFolder = rootFolder || mega?.root;

    // Call the function to start the search process and find the files by name
    let foundData = await get.fileByName(rootFolder, targetFileName);

    // Calculate total space needed for all the data in the foundData array
    const totalSpaceNeeded = await getTotalSpaceNeeded(foundData);

    // Check storage space before downloading
    const isEnoughSpace = checkStorageSpace(
      totalSpaceNeeded,
      downloadDestination
    );

    if (!isEnoughSpace) {
      console.log("Free Up Storage On Device To Download Media");
      return;
    }

    // Download and save the data to the download folder
    for (let i = 0; i < foundData.length; i++) {
      const fileExtension = foundData[i].ext;
      const fileNameWithoutExtension = foundData[i].basename || targetFileName;
      const filePath =
        i === 0
          ? `${downloadDestination}/${fileNameWithoutExtension}${fileExtension}`
          : `${downloadDestination}/${fileNameWithoutExtension}_${i}${fileExtension}`;
      await saveFileWithUniqueName(filePath, foundData[i].buffer, 0, fileExtension);
    }
    return console.log("All files downloaded and saved successfully!");
  } catch (error) {
    console.error("Error:", error);
  }
}


// WORKS
/**
 * Create a unique local folder with a name based on the provided folderName.
 * If a folder with the same name already exists, increment a suffix number.
 *
 * @param {string} destination - The destination directory where the new folder will be created.
 * @param {string} folderName - The desired name of the folder.
 * @returns {string} - The path of the newly created local folder.
 */
function makeLocalFolder(destination, folderName) {
  let suffix = "";
  let folderNameWithSuffix = folderName;

  // Check if a folder with the same name already exists
  while (fs2.existsSync(`${destination}/${folderNameWithSuffix}`)) {
    const matches = folderNameWithSuffix.match(/^(.*?)(_([0-9]+))?$/);
    const existingNumber = parseInt(matches[3]) || 0;

    // Increment the suffix number and update folder name
    suffix = `_${existingNumber + 1}`;
    folderNameWithSuffix = `${matches[1]}${suffix}`;
  }

  // Create the new folder
  fs2.mkdirSync(`${destination}/${folderNameWithSuffix}`);

  // Return the path of the newly created local folder
  return `${destination}/${folderNameWithSuffix}`;
}


// WORKS
/**
 * Download files from a specified folder by name.
 *
 * @param {object} mega - The Mega instance for performing operations.
 * @param {string} targetFolderName - The name of the target folder.
 * @param {string} downloadDestination - The local directory where files will be downloaded.
 * @param {object} rootFolder - The root folder to begin the search (optional).
 */
async function folderByName(
  mega,
  targetFolderName,
  downloadDestination,
  rootFolder
) {
  // Only reload after making changes to the Mega instance, not through the code
  // await mega.reload();

  try {
    // Get the root folder
    rootFolder = rootFolder || mega?.root;

    // Call the function to start the search process and find the folders by name
    let foundData = await get.folderByName(rootFolder, targetFolderName);

    // Iterate through the found folders and download their contents
    for (const folder of foundData || []) {
      // Create a local folder for downloading
      downloadDestination = makeLocalFolder(downloadDestination, folder.name);
      
      // Download contents of the folder
      await folderContent(folder.file, downloadDestination, mega);
    }

    if (foundData.length > 0) {
      console.log("All folders downloaded and saved successfully!");
    } else {
      console.log("No folders found with that name");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}


// DOES NOT WORK
/**
 * Download folders/files from Mega by their node IDs.
 *
 * @param {string} nodeId - The unique node ID of the folder/file.
 * @param {string} downloadDestination - The local directory where folders/files will be downloaded.
 * @param {object} mega - The Mega instance for performing operations.
 */
/**
async function byNodeId(nodeId, downloadDestination, mega) {
  // Get data from Mega using the specified node ID
  const foundData = await get.byNodeId(nodeId, mega);

  // Start the download process
  // Calculate total space needed for all the data in the foundData array
  const totalSpaceNeeded = await getTotalSpaceNeeded(foundData);

  // Check available storage space before downloading
  const isEnoughSpace = checkStorageSpace(totalSpaceNeeded, downloadDestination);

  if (!isEnoughSpace) {
    console.log("Free Up Storage On Device To Download Media");
    return;
  }

  // Download and save the data to the download folder
  for (let i = 0; i < foundData.length; i++) {
    const filePath =
      i === 0
        ? `${downloadDestination}/${foundData[i].targetFolderName}`
        : `${downloadDestination}/${foundData[i].targetFolderName}_${i}`;
    saveFolderWithUniqueName(filePath, foundData[i], 0);
  }
  return console.log("All folders downloaded and saved successfully!");
}
*/



// WORKS
/**
 * Downloads a file by its Mega URL and saves it to the specified download destination.
 *
 * @param {string} url - The Mega URL of the file to download.
 * @param {string} downloadDestination - The local directory where the file will be downloaded.
 */
async function byURL(url, downloadDestination) {
  try {
    const file = await get.byURL(url);
    let foundData = [file];

    // Calculate total space needed for all the data in the foundData array
    const totalSpaceNeeded = await getTotalSpaceNeeded(foundData);

    // Check storage space before downloading
    const isEnoughSpace = checkStorageSpace(totalSpaceNeeded, downloadDestination);

    if (!isEnoughSpace) {
      console.log("Free Up Storage On Device To Download Media");
      return;
    }

    // Download and save the data to the download folder
    for (let i = 0; i < foundData.length; i++) {
      const fileExtension = foundData[i].ext;
      const fileNameWithoutExtension = foundData[i].basename || targetFileName;
      const filePath =
        i === 0
          ? `${downloadDestination}/${fileNameWithoutExtension}${fileExtension}`
          : `${downloadDestination}/${fileNameWithoutExtension}_${i}${fileExtension}`;
      await saveFileWithUniqueName(filePath, foundData[i].buffer, 0, fileExtension);
    }
    return console.log("All files downloaded and saved successfully!");
  } catch (error) {
    console.error("Error:", error);
  }
}


// WORKS
/**
 * Recursively downloads files and folders from a Mega folder to the specified download destination.
 * For each file in the folder, download it by nodeID.
 * If it is a folder, call this function again to download all the files within that folder in a new local folder under the same name and directory hierarchy.
 *
 * @param {Object} folder - The Mega folder to download files and folders from.
 * @param {string} downloadDestination - The local directory where the files and folders will be downloaded.
 * @param {Mega} mega - The Mega instance used for interaction.
 */
async function folderContent(folder, downloadDestination, mega) {
  // Go through each file/folder in the folder
  // If it is a file, download it to the downloadDestination inside a folder with the same name as the folder in Mega
  // If it is a folder, create a new folder in the downloadDestination with the same name as the folder in Mega and call this function again with the new folder as the folder parameter
  // If there are no more files/folders in the folder, return

  if (folder?.children?.length > 0) {
    for (let i = 0; i < folder.children.length; i++) {
      const child = folder.children[i];
      if(!child.directory){
        console.log(`Downloading [ ${child.name} ] File...`);
      } else {
        console.log(`Loading [ ${child.name} ] Folder...`);
      }
      if (!child.directory) {
        // await byNodeId(child.nodeId, downloadDestination, mega);
        const data = {
          file: child,
          link: child.shared ? child.shareURL : await child.link().catch((err) => console.log(err)),
          buffer: await child.downloadBuffer(),
          name: child.name,
          nodeId: child.nodeId,
          type: `${child.directory ? "Folder" : "File"}`,
          basename: path.parse(child.name).name,
            ext: path.parse(child.name).ext,
        };
        try {
          let foundData = [data];

          // Calculate total space needed for all the data in the foundData array
          const totalSpaceNeeded = await getTotalSpaceNeeded(foundData);

          // Check storage space before downloading
          const isEnoughSpace = checkStorageSpace(
            totalSpaceNeeded,
            downloadDestination
          );

          if (!isEnoughSpace) {
            console.log("Free Up Storage On Device To Download Media");
            return;
          }

          // Download and save the data to the download folder
          for (let i = 0; i < foundData.length; i++) {
            const fileExtension = foundData[i].ext;
            const fileNameWithoutExtension = foundData[i].basename;
            const filePath =
              i === 0
                ? `${downloadDestination}/${fileNameWithoutExtension}${fileExtension}`
                : `${downloadDestination}/${fileNameWithoutExtension}_${i}${fileExtension}`;
                
            await saveFileWithUniqueName(filePath, foundData[i].buffer, 0, fileExtension);
          }
          // return console.log("All files downloaded and saved successfully!");
        } catch (error) {
          console.error("Error:", error);
        }
      } else if (child.directory) {
        const newDownloadDestination = makeLocalFolder(downloadDestination, child.name);
        await folderContent(child, newDownloadDestination, mega);
      }
    }
  } else {
    return;
  }
}


module.exports = {
  fileByName,
  folderByName,
  // byNodeId, // Disabled for now
  byURL,
  folderContent,
};
