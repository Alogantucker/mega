const { File } = require("megajs");
const fs = require("fs").promises;
const fs2 = require("fs");
const { execSync } = require("child_process");
const os = require("os");
const get = require("./get.js");
const path = require('path');

// Function to check available storage space and delete files if needed
function checkStorageSpace(spaceNeeded, downloadFolder) {
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

// Function to calculate total space needed for all data in the foundData array
async function getTotalSpaceNeeded(dataArray) {

  return dataArray.reduce(async (total, data) => data?.buffer?.length ? total + data?.buffer?.length : total + data?.length, 0);
}

// Function to save the data to a file with a unique name
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
// Tested & Working
async function fileByName(
  mega,
  targetFileName,
  downloadDestination,
  rootFolder
) {
  // only reload after making changes to the mega not through the code
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

// Function to save the data to a file with a unique name
function saveFolderWithUniqueName(folderPath, data, counter = 0) {
  const fullFolderPath =
    counter === 0
      ? folderPath
      : `${folderPath.replace(/(\.[^.]+$)/, "")}(${counter})$1`;
  if (fs.existsSync(fullFolderPath)) {
    return saveFolderWithUniqueName(folderPath, data, counter + 1);
  } else {
    // Save the file with the original extension if it doesn't exist
    fs.writeFileSync(fullFolderPath, data);
    console.log(`Download and save successful: ${fullFolderPath}`);
  }
}

function makeLocalFolder(destination, folderName) {
  let suffix = "";
  let folderNameWithSuffix = folderName;

  while (fs2.existsSync(`${destination}/${folderNameWithSuffix}`)) {
    const matches = folderNameWithSuffix.match(/^(.*?)(_([0-9]+))?$/);
    const existingNumber = parseInt(matches[3]) || 0;
    suffix = `_${existingNumber + 1}`;
    folderNameWithSuffix = `${matches[1]}${suffix}`;
  }

  fs2.mkdirSync(`${destination}/${folderNameWithSuffix}`);
  return `${destination}/${folderNameWithSuffix}`;
}

// untested, NEED TO TEST
async function folderByName(
  mega,
  targetFolderName,
  downloadDestination,
  rootFolder
) {
  // only reload after making changes to the mega not through the code
  // await mega.reload();

  try {
    // Get the root folder
    rootFolder = rootFolder || mega?.root;

    // Call the function to start the search process and find the files by name
    let foundData = await get.folderByName(rootFolder, targetFolderName);
    

    for (const folder of foundData || []) {
      downloadDestination = makeLocalFolder(downloadDestination, folder.name);
      await folderContent(folder.file, downloadDestination, mega);
    }
    if (foundData.length > 0) {
      console.log("All folders downloaded and saved successfully!"); 
    } else{
      console.log("No folders found with that name");
    }
  

    
  } catch (error) {
    console.error("Error:", error);
  } 

}

// DOES NOT WORK
// async function byNodeId(nodeId, downloadDestination, mega) {
//   const foundData = await get.byNodeId(nodeId, mega)

//   // Start the download
//   // Calculate total space needed for all the data in the foundData array
//   const totalSpaceNeeded = await getTotalSpaceNeeded(foundData);

//   // Check storage space before downloading
//   const isEnoughSpace = checkStorageSpace(
//     totalSpaceNeeded,
//     downloadDestination
//   );

//   if (!isEnoughSpace) {
//     console.log("Free Up Storage On Device To Download Media");
//     return;
//   }

//   // Download and save the data to the download folder
//   for (let i = 0; i < foundData.length; i++) {
//     const filePath =
//       i === 0
//         ? `${downloadDestination}/${targetFolderName}`
//         : `${downloadDestination}/${targetFolderName}_${i}`;
//     saveFolderWithUniqueName(filePath, foundData[i], 0);
//   }
//   return console.log("All folders downloaded and saved successfully!");
// }

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
  //byNodeId,
  byURL,
  folderContent,
};
