// Get all the main elements from the page that we need to control
const scanButton = document.querySelector("#scanButton");
const disconnectButton = document.querySelector("#disconnectButton");
const serviceUuidInput = document.querySelector("#serviceUuid");
const characteristicUuidInput = document.querySelector("#characteristicUuid");
const namePrefixInput = document.querySelector("#namePrefix");
const commandSuffixInput = document.querySelector("#commandSuffix");
const supportText = document.querySelector("#supportText");
const deviceName = document.querySelector("#deviceName");
const lastCommand = document.querySelector("#lastCommand");
const statusStrip = document.querySelector(".status-strip");
const logList = document.querySelector("#logList");
const clearLogButton = document.querySelector("#clearLogButton");

// These are all buttons that have a data-command attribute
// Each one sends a different command to the Bluetooth device
const controlButtons = document.querySelectorAll("[data-command]");

// These variables store the currently connected Bluetooth device
// and the characteristic that we write data to
let bluetoothDevice = null;
let writeCharacteristic = null;

// TextEncoder is used to convert normal text commands into bytes,
// because Bluetooth characteristics send binary data
const encoder = new TextEncoder();

// Removes extra spaces from the UUID input
function normalizeUuid(value) {
  return value.trim();
}

// Converts the suffix option from the UI into real line ending characters
function decodeSuffix(value) {
  if (value === "\\n") return "\n";
  if (value === "\\r\\n") return "\r\n";
  return "";
}

// Updates the status text, connection styling, and disconnect button state
function setStatus(message, isConnected = Boolean(writeCharacteristic)) {
  supportText.textContent = message;
  statusStrip.classList.toggle("connected", isConnected);
  disconnectButton.disabled = !bluetoothDevice;
}

// Adds a message to the log with the current time
function addLog(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logList.append(item);
}

// Enables or disables all command buttons at once
function setControlsDisabled(disabled) {
  controlButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

// Checks that the user has entered both UUIDs before connecting
function validateSettings() {
  const serviceUuid = normalizeUuid(serviceUuidInput.value);
  const characteristicUuid = normalizeUuid(characteristicUuidInput.value);

  if (!serviceUuid || !characteristicUuid) {
    throw new Error("Enter both a service UUID and characteristic UUID.");
  }

  return { serviceUuid, characteristicUuid };
}

// Handles the full Bluetooth connection process
async function connect() {
  // Web Bluetooth does not work in every browser,
  // so we check if the browser supports it first
  if (!navigator.bluetooth) {
    setStatus("Web Bluetooth is not available in this browser.");
    return;
  }

  const { serviceUuid, characteristicUuid } = validateSettings();

  // If the user entered a name prefix, search by device name.
  // Otherwise, search by Bluetooth service UUID.
  const namePrefix = namePrefixInput.value.trim();
  const filters = namePrefix ? [{ namePrefix }] : [{ services: [serviceUuid] }];

  // optionalServices is needed when we search by name,
  // because the browser still needs permission to access this service
  const optionalServices = namePrefix ? [serviceUuid] : [];

  setStatus("Opening Bluetooth device picker...");

  // Opens the browser's Bluetooth device picker
  bluetoothDevice = await navigator.bluetooth.requestDevice({
    filters,
    optionalServices
  });

  // If the device disconnects, this function will clean up the UI
  bluetoothDevice.addEventListener("gattserverdisconnected", handleDisconnect);

  deviceName.textContent = bluetoothDevice.name || "Unnamed BLE device";
  setStatus("Connecting to GATT server...");

  // Connect to the device and find the service and characteristic
  // that we will use to send commands
  const server = await bluetoothDevice.gatt.connect();
  const service = await server.getPrimaryService(serviceUuid);
  writeCharacteristic = await service.getCharacteristic(characteristicUuid);

  setStatus(`Connected to ${bluetoothDevice.name || "device"}.`, true);
  addLog(`Connected: ${bluetoothDevice.name || bluetoothDevice.id}`);
}

// Resets the app state after the Bluetooth device disconnects
function handleDisconnect() {
  writeCharacteristic = null;
  bluetoothDevice = null;
  deviceName.textContent = "No device connected";
  setStatus("Device disconnected.", false);
  addLog("Disconnected");
}

// Disconnects from the Bluetooth device if it is currently connected
async function disconnect() {
  if (bluetoothDevice?.gatt?.connected) {
    bluetoothDevice.gatt.disconnect();
    return;
  }

  handleDisconnect();
}

// Sends a command to the connected Bluetooth characteristic
async function sendCommand(command) {
  // We cannot send anything unless a device is connected
  if (!writeCharacteristic) {
    addLog(`Not connected: ${command}`);
    setStatus("Connect to a BLE device before sending commands.", false);
    return;
  }

  // Add the selected suffix, for example a newline, if the device expects it
  const payload = `${command}${decodeSuffix(commandSuffixInput.value)}`;

  try {
    // Convert the command to bytes and send it over Bluetooth
    await writeCharacteristic.writeValue(encoder.encode(payload));

    lastCommand.textContent = `Last command: ${command}`;
    addLog(`Sent: ${JSON.stringify(payload)}`);
  } catch (error) {
    setStatus(error.message || "Failed to send command.", false);
    addLog(`Send failed: ${command}`);
  }
}

// Adds mouse, touch, and keyboard behavior to a command button
function wireCommandButton(button) {
  const command = button.dataset.command;

  // This visually marks the button as pressed and sends the command
  const activate = () => {
    button.classList.add("active");
    sendCommand(command);
  };

  // This removes the pressed visual state
  const deactivate = () => button.classList.remove("active");

  // pointerdown works for both mouse and touch input
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    // Keeps tracking this pointer even if it moves slightly outside the button
    button.setPointerCapture(event.pointerId);
    activate();
  });

  button.addEventListener("pointerup", deactivate);
  button.addEventListener("pointercancel", deactivate);
  button.addEventListener("lostpointercapture", deactivate);

  // Allow the button to also work with keyboard controls
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });

  button.addEventListener("keyup", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      deactivate();
    }
  });
}

// When the scan button is clicked, try to connect to a BLE device
scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;

  try {
    await connect();
  } catch (error) {
    setStatus(error.message || "Bluetooth connection failed.");
    addLog(`Connection failed: ${error.message || "unknown error"}`);
  } finally {
    // Re-enable the scan button even if the connection fails
    scanButton.disabled = false;
  }
});

// Basic button actions
disconnectButton.addEventListener("click", disconnect);
clearLogButton.addEventListener("click", () => logList.replaceChildren());

// Set up all command buttons
controlButtons.forEach(wireCommandButton);

// Make sure the control buttons are usable when the page loads
setControlsDisabled(false);

// Show a warning if the browser does not support Web Bluetooth
if (!navigator.bluetooth) {
  setStatus("Use Chrome or Edge over localhost/HTTPS for Web Bluetooth support.");
}