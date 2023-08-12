const path = require('path');
const { File } = require("megajs");

const MAX_RETRIES = 3;

/**
 * Retry the execution of a function for a maximum number of attempts.
 *
 * @param {Function} func - The function to retry.
 * @param {number} maxAttempts - The maximum number of attempts to retry the function.
 * @throws {Error} Throws the last error if all attempts fail.
 */
async function retryWithMaxAttempts(func, maxAttempts) {
  let attempts = 0;
  let lastError = null;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      await func();
      return; // Successful, exit the loop
    } catch (error) {
      lastError = error;
      console.error(`Error during attempt ${attempts}:`, error);
      // Delay before the next retry
      await new Promise(resolve => setTimeout(resolve, 1000)); // Adjust the delay time if needed
    }
  }

  throw lastError; // Throw the last error if all attempts failed
}



/**
 * Recursively explores a folder and its subfolders to find files & folders with a given name.
 * @param {object} folder - The folder to explore.
 * @param {string} targetFileName - The name of the target file to search for.
 * @param {Set} exploredFolders - A set to track explored folders and avoid duplicates.
 * @returns {Array} - An array of found file data.
 */
async function exploreFolderByName(
  folder,
  targetFileName,
  exploredFolders = new Set()
) {
  const folderUniqueID = folder.nodeId;
  const foundData = [];

  // Avoid re-exploring folders already visited
  if (
    exploredFolders.has(folderUniqueID) &&
    folderUniqueID !== Array.from(exploredFolders)[0]
  ) {
    return foundData;
  }

  try {
    await retryWithMaxAttempts(async () => {
      const matchingFiles = [];
for (const file of folder?.children || []) {
  if (file?.name) {
    try {
      let name = path.parse(file?.name).name;

      if (name === path.parse(targetFileName).name) {
        matchingFiles.push(file);
      }
    } catch (error) {
      console.error("Error processing file:", error);
    }
  }
}

  
      if (matchingFiles && matchingFiles.length > 0) {
        for (const file of matchingFiles) {
          // Create data object for found file
          const data = {
            file,
            link: file?.shareURL || (async ()=>{
              try {
                await file?.link()
              } catch (error) {
                try {
                  if (file.directory){
                    await file?.shareFolder()
                  }
                } catch (error) {
                  if (error.message === "Error while matching files"){
                    return null
                  }
                }
              }
            }),
            buffer: file.directory === "False" ?await file.downloadBuffer() : null,
            name: file.name,
            basename: path.parse(file.name).name,
            ext: path.parse(file.name).ext,
            nodeId: file.nodeId,
            type: `${file.directory ? "Folder" : "File"}`,
          };
          foundData.push(data);
        }
      }
    }, MAX_RETRIES);
  } catch (finalError) {
    console.error("All attempts failed:", finalError);
  }  
  

  try {
    if (!folder.attributes && folder.name !== "Cloud Drive") {
      await folder.loadAttributes();
    }
  } catch (error) {
    // Ignore attribute loading errors
  }

  exploredFolders.add(folderUniqueID);



  if (folder.children && folder.children.length > 0) {
    for (const child of folder.children) {
      if (child.directory) {
        // Recursively explore child folders
        const childFoundData = await exploreFolderByName(
          child,
          targetFileName,
          exploredFolders
        );
        foundData.push(...childFoundData);
      }
    }
  }

  return foundData;
}

/**
 * Finds files by name in a folder and its subfolders.
 * @param {object} folder - The folder to start searching from.
 * @param {string} targetFileName - The name of the target file to search for.
 * @returns {Array} - An array of found file data.
 */
async function fileByName(folder, targetFileName) {
  // Call the exploreFolderByName function to find files matching the target name
  const foundData = await exploreFolderByName(folder, targetFileName);

  // Filter out folders from the found data, keeping only files
  return foundData.filter((data) => data.type === "File");
}

/**
 * Finds all folders by name in a folder and its subfolders.
 * @param {object} folder - The folder to start searching from.
 * @param {string} targetFileName - The name of the target folder to search for.
 * @returns {Array} - An array of found folder data.
 */
async function folderByName(folder, targetFolderName) {
  // Call the exploreFolderByName function to find folders matching the target name
  const foundData = await exploreFolderByName(folder, targetFolderName);

  // Filter out files from the found data, keeping only folders
  return foundData.filter((data) => data.type === "Folder");
}

/**
 * Recursively searches the Mega root for a folder with the given name.
 * If a parent folder name is provided, the function searches within the specified parent folder.
 *
 * @param {File} rootFolder - The root folder to start searching from.
 * @param {string[]} folderNames - The array of folder names representing the hierarchy to traverse.
 * @param {Set} [exploredFolders=new Set()] - A set to track explored folders and avoid infinite loops.
 * @returns {File|null} The found folder or null if not found.
 *
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
async function folderByDirPath(
  rootFolder,
  folderNames,
  exploredFolders = new Set()
) {
  // Function to explore the directory hierarchy based on the dir path aka folderNames array
  async function exploreDirectory(folder, folderNames, exploredFolders) {
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
          const result = await exploreDirectory(
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
        const result = await exploreDirectory(
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

  return exploreDirectory(rootFolder, folderNames, exploredFolders);
}

/**
 * Retrieves file information and content from a provided URL and creates an object containing relevant file details.
 *
 * @param {string} url - The URL of the file.
 * @returns {Object} An object containing file information and content.
 */
async function byURL(url) {
  // Get the file object from the provided URL
  const file = File.fromURL(url);

  // Load file attributes
  await file.loadAttributes();

  // Download the file content
  const buffer = await file.downloadBuffer();

  // Prepare and return the file information object
  const fileInfo = {
    file, // The File object representing the downloaded file
    link: url, // The URL of the file
    buffer, // The file content as a buffer
    name: file.name, // The name of the file
    basename: path.parse(file.name).name, // The base name of the file (without extension)
    ext: path.parse(file.name).ext, // The file extension
    nodeId: file.nodeId, // The node ID of the file
    type: `${file.directory ? "Folder" : "File"}`, // The type of the file (Folder or File)
  };

  // Return the file information object
  return fileInfo;
}



/**
 * Recursively explores a folder by its node ID and retrieves files matching the target node ID.
 *
 * @param {File} folder - The folder to explore.
 * @param {string} targetNodeId - The target node ID to search for.
 * @param {Set} [exploredFolders=new Set()] - A set to track explored folders and avoid infinite loops.
 * @returns {Array} An array of data objects containing file information and content.
 */
async function exploreFolderByNodeId(folder, targetNodeId, exploredFolders = new Set()) {
  const folderUniqueID = folder.nodeId;
  const foundData = [];

  // Avoid re-exploring folders already visited
  if (
    exploredFolders.has(folderUniqueID) &&
    folderUniqueID !== Array.from(exploredFolders)[0]
  ) {
    return foundData;
  }

  try {
    const matchingFiles = [];
    for (const file of folder?.children || []) {
      if (file?.nodeId && file.nodeId === targetNodeId) {
        matchingFiles.push(file);
      }
    }

    if (matchingFiles && matchingFiles.length > 0) {
      for (const file of matchingFiles) {
        // Create data object for found file
        const data = {
          file,
          link: file?.shareURL || (async () => {
            try {
              await file?.link();
            } catch (error) {
              try {
                if (file.directory) {
                  await file?.shareFolder();
                }
              } catch (error) {
                if (error.message === "Error while matching files") {
                  return null;
                }
              }
            }
          }),
          buffer: file.directory === "False" ? await file.downloadBuffer() : null,
          name: file.name,
          nodeId: file.nodeId,
          type: `${file.directory ? "Folder" : "File"}`,
        };
        foundData.push(data);
      }
    }
  } catch (finalError) {
    console.error("All attempts failed:", finalError);
  }

  try {
    if (!folder.attributes && folder.name !== "Cloud Drive") {
      await folder.loadAttributes();
    }
  } catch (error) {
    // Ignore attribute loading errors
  }

  exploredFolders.add(folderUniqueID);

  if (folder.children && folder.children.length > 0) {
    for (const child of folder.children) {
      if (child.directory) {
        // Recursively explore child folders
        const childFoundData = await exploreFolderByNodeId(
          child,
          targetNodeId,
          exploredFolders
        );
        foundData.push(...childFoundData);
      }
    }
  }

  return foundData;
}


/**
 * Retrieves data for a file or folder by its node ID.
 *
 * @param {string} nodeId - The node ID of the file or folder to retrieve data for.
 * @param {Mega} mega - The Mega instance to use for retrieval.
 * @returns {Array} An array of data objects containing file information and content.
 */
async function byNodeId(nodeId, mega) {
  // Retrieve data for a file or folder by its node ID
  const foundData = await exploreFolderByNodeId(mega.root, nodeId);
  return foundData;
}


module.exports = {
  fileByName,
  folderByName,
  folderByDirPath,
  byURL,
  byNodeId
};
