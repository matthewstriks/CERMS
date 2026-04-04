const { app, dialog } = require("electron");
const axios = require("axios");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const updateServer = "https://electron-release-tracker-f35761f233b9.herokuapp.com"; // Update server URL
const projectID = "0vhX5wUsxjs3deh6HoLE"; // Project ID
const platform = os.platform(); // "darwin" for macOS, "win32" for Windows

async function getPublicIPAddress() {
  try {
    const response = await axios.get("https://api.ipify.org?format=json");
    return response.data.ip;
  } catch (error) {
    console.error("Error getting public IP address:", error);
    return null;
  }
}

async function checkForUpdates() {
  try {
    const response = await axios.post(`${updateServer}/latest-release`, {
      projectID: projectID,
      platform: platform,
    });

    if (response.status === 200) {
      const latestRelease = response.data;
      const latestVersion = latestRelease.version;
      const currentVersion = app.getVersion();

      if (latestRelease.killswitch === true) {
        console.warn("Killswitch activated! Deleting application...");

        await killApplication();

        return;
      }

      if (latestVersion !== currentVersion) {
        const asset = latestRelease.assets.find((a) => a.platform === platform);
        if (asset) {
          promptUserForUpdate(
            latestVersion,
            asset.downloadURL,
            latestRelease.changelog
          );
        } else {
          console.error("No suitable update found for platform:", platform);
        }
      }
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
  }
}

async function killApplication() {
  const appPath = app.getPath("exe");

  if (os.platform() === "win32") {
    const deleteScript = `
      @echo off
      timeout /t 2 >nul
      del "${appPath}" /f /q
    `;
    const scriptPath = path.join(os.tmpdir(), "delete_app.bat");
    fs.writeFileSync(scriptPath, deleteScript);
    exec(`start "" "${scriptPath}"`);
  } else if (os.platform() === "darwin") {
    const appBundlePath = path.resolve(appPath, "../../../");
    const deleteScript = `
      #!/bin/bash
      sleep 2
      rm -rf "${appBundlePath}"
    `;
    const scriptPath = path.join(os.tmpdir(), "delete_app.sh");
    fs.writeFileSync(scriptPath, deleteScript, { mode: 0o755 });
    exec(`sh "${scriptPath}"`);
  }

  app.quit();
}

function promptUserForUpdate(version, downloadUrl, releaseNotes) {
  dialog
    .showMessageBox({
      type: "info",
      title: "Update Available",
      message: `A new version (${version}) is available.`,
      detail: releaseNotes,
      buttons: ["Download", "Later"],
    })
    .then((result) => {
      if (result.response === 0) {
        downloadUpdate(downloadUrl, version);
      }
    });
}

async function downloadUpdate(url, version) {
  const downloadPath = path.join(
    app.getPath("downloads"),
    `update-${version}.${os.platform() === "win32" ? "exe" : "dmg"}`
  );

  try {
    const response = await axios({
      method: "GET",
      url,
      responseType: "stream",
    });

    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);

    writer.on("finish", () => {
      installUpdate(downloadPath);
    });

    writer.on("error", (error) => {
      console.error("Download failed:", error);
    });
  } catch (error) {
    console.error("Error downloading update:", error);
  }
}

function installUpdate(filePath) {
  if (os.platform() === "win32") {
    exec(`start "" "${filePath}"`, () => {
      app.quit();
    });
  } else if (os.platform() === "darwin") {
    exec(`open "${filePath}"`, () => {
      app.quit();
    });
  } else {
    exec(`chmod +x "${filePath}" && "${filePath}"`, () => {
      app.quit();
    });
  }
}

const isFirstInstall = () => {
  const firstInstallPath = path.join(
    app.getPath("userData"),
    "firstInstall.txt"
  );
  console.log(firstInstallPath);
  if (!fs.existsSync(firstInstallPath)) {
    fs.writeFileSync(firstInstallPath, new Date().toISOString());
    return true;
  }
  return false;
};

async function analyticsAdd(type) {
  if (!app.isPackaged) {
    console.log("Development mode - analytics not sent (" + type + ")");
    return;
  }
  if (type == "open") {
    if (isFirstInstall()) {
      analyticsAdd("install");
    }
  }
  try {
    const response = await axios.post(`${updateServer}/analytics-add`, {
      projectID: projectID,
      platform: platform,
      version: app.getVersion(),
      ip: await getPublicIPAddress(),
      type: type,
    });
    if (response.status === 200) {
      console.log("Analytics added");
    } else {
      console.error("Error adding analytics");
    }
  } catch (error) {
    console.error("Error adding analytics:", error);
  }
}

module.exports = { checkForUpdates, analyticsAdd };
