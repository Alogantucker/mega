const fs = require('fs').promises;
const path = require('path');
const { Readable } = require('stream'); // Add this import for the Readable class
const get = require("./get.js");


/**
 * Upload a file to a specific folder in Mega.
 *
 * @param {string} filePath - The local file path to be uploaded.
 * @param {object} mega - The Mega instance for performing operations.
 * @param {string[]} folderNames - An array of folder names representing the target folder's path.
 *                                 Example: ["Root", "Documents", "ProjectFiles"]
 *                                 Target Folder Path: /Root/Documents/ProjectFiles
 * @param {object} attributes - Additional attributes to be applied to the uploaded file (optional).
 *                             Example attributes:
 *                             attributes: {
 *                               description: "This is a sample uploaded file",
 *                               uploader: "John Doe",
 *                             },
 */
async function fileToFolder(filePath, mega, folderNames, attributes = {}) {
  try {
    // Read the content of the local file
    const content = await fs.readFile(filePath);

    if (content) {
      // Find the target folder using the provided folder names
      const targetFolder = await get.folderByDirPath(mega.root, folderNames);

      if (targetFolder) {
        // Create an upload stream for the Mega API
        const uploadStream = mega.upload({
          target: targetFolder,
          name: path.basename(filePath),
          size: content.length,
          handleRetries: (tries, error, cb) => {
            if (tries > 8) {
              cb(error);
            } else {
              setTimeout(() => cb(null, true), 1000 * Math.pow(2, tries));
            }
          },
          attributes,
        });

        // Create a readable stream for the local file content
        const readStream = new Readable();
        readStream.push(content); // Add data to the internal queue for users of the stream to consume
        readStream.push(null); // Push null to signal end of stream
        readStream.pipe(uploadStream); // Pipe the data to the upload stream

        // Return a promise to handle upload completion or errors
        return new Promise((resolve, reject) => {
          uploadStream.on("complete", (file) => {
            console.log(`The ${file?.name} file was uploaded to the ${`${targetFolder?.parent?.name ? `${targetFolder.parent.name}/` : ``}${targetFolder?.name}`} Mega Folder!`);
            resolve(file);
          });
          uploadStream.on("error", (error) => {
            console.error(`Error uploading file to the ${`${targetFolder?.parent?.name ? `${targetFolder.parent.name}/` : ``}${targetFolder?.name}`} Mega Folder:`, error);
            reject(error);
          });
        });
      } else {
        console.log(`Target folder not found: ${folderNames.join("/")}`);
      }
    } else {
      console.log(`File to be uploaded does not exist at ${filePath}`);
    }
  } catch (error) {
    console.error("Error reading or uploading file:", error);
    throw error;
  }
}

  module.exports = {
    fileToFolder,
  }