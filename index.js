require("dotenv").config({ path: "./my.env" }); // replace with your own .env file path
const login = require("./login");
const download = require("./download.js");
const upload = require("./upload.js");

const email = `${process.env.MEGA_EMAIL}`; // replace with your mega email; my email is stored in my.env file
const password = `${process.env.MEGA_PASSWORD}`; // replace with your mega password; my password is stored in my.env file

const downloadFolder = `${process.env.DownloadFolderPath}`; // replace with your desired download folder
const fileName = "rec_n.06_21.wav"; // replace with the file you would like to download from mega

// Newest Working Code
/**
 * A comprehensive testing function to validate various Mega API operations.
 * This function covers login, file and folder download, file upload, and more.
 *
 * @returns {Promise<void>} - A promise that resolves when all tests are completed.
 */
async function testAll() {
  let mega;

  try {
    // Log in to Mega
    mega = await login(email, password);
  } catch (error) {
    console.error("Error login:", error);
    return;
  } finally {
    try {
      // Test download {fileByName}
      await download.fileByName(mega, fileName, downloadFolder);
    } catch (error) {
      console.error("Error download {fileByName}:", error);
    } finally {
      try {
        // Test download {fileByURL}
        let url = "https://mega.nz/file/qZpFgYBT#YYw_cNC5szcS-JZlDmwMVCKSz6Q2uoibcb29jPM286A";
        // await download.byURL(url, downloadFolder);
      } catch (error) {
        console.error("Error download {fileByURL}:", error);
      } finally {
        try {
          // Test upload {fileToFolder}
          await upload.fileToFolder(
            `${process.env.Resume_File_Path}`,
            mega,
            [`Node Test Folder`, `tester`],
            { uploader: `Steve Jobs` }
          );
        } catch (error) {
          console.error("Error upload {fileToFolder}:", error);
        } finally {
          try {
            // Test download {folderByName}
            await download.folderByName(mega, "Node Test Folder", downloadFolder);
          } catch (error) {
            console.error("Error download {folderByName}:", error);
          } 
          // Finally block for further testing:
          // NOT WORKING
          // try {
          //   // Test download file {byNodeId}
          //   await download.byNodeId(
          //     mega,
          //     `uiBz2ldZokEnEG6HSzNVeIF5LNpnXUuvsbIzjOiqM-s`,
          //     downloadFolder
          //   );
          // } catch (error) {
          //   console.error("Error download file {byNodeId}:", error);
          // } finally {
          //   // NOT WORKING
          //   try {
          //     // Test download folder {byNodeId}
          //     await download.byNodeId(mega, `TRwwVCjb`, downloadFolder);
          //   } catch (error) {
          //     console.error("Error download file {byNodeId}:", error);
          //   }
          // }
        }
      }
      // Test upload
    }
  }
}


// testAll()


