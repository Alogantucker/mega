const { Storage } = require("megajs");
require("dotenv").config({ path: "./my.env" });

const myEmail = `${process.env.MEGA_EMAIL}`;
const myPassword = `${process.env.MEGA_PASSWORD}`;

/**
 * Attempts to log in to Mega using the provided email and password.
 * If an error occurs on the first attempt, it waits 1 second and reattempts.
 * If an error occurs on the second attempt, it logs the error and returns an error message.
 * @param {string} email - The email for Mega login.
 * @param {string} password - The password for Mega login.
 * @returns {Storage|string} - Mega client object if login is successful, or an error message if login fails.
 */
async function megaLogin(email = myEmail, password = myPassword) {
  const startTime = new Date();
  let reattempt = false; // Flag to track reattempts

  while (true) { // Infinite loop for retrying login
    const mega = new Storage({ email, password });

    try {
      if (reattempt) {
        console.log("Reattempting login...");
      } else {
      console.log("Logging into Mega")
      }
      await mega.login();
      const endTime = new Date();
const runtime = endTime - startTime;

console.log("Mega Client Login successful!");

if (runtime < 1000) {
  console.log(`Login took ${runtime}ms`);
} else {
  const seconds = Math.floor(runtime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const formattedTime = `${hours > 0 ? hours + 'h ' : ''}${minutes % 60}m ${seconds % 60}s`;

  console.log(`Login took ${formattedTime}`);
}
      
      return mega; // Return Mega client object if successful
    } catch (error) {
      if (reattempt) { // If already reattempted once
        console.error("Error:", error.message);
        return `Unable to login to mega due to: ${error.message}`;
      } else {
        console.log(`Reattempting login after error: ${error.message}`);
        reattempt = true;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
      }
    }
  }
}

module.exports = megaLogin;
