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
const controlButtons = document.querySelectorAll("[data-command]");

let bluetoothDevice = null;
let writeCharacteristic = null;

const encoder = new TextEncoder();

function normalizeUuid(value) {
  return value.trim();
}

function decodeSuffix(value) {
  if (value === "\\n") return "\n";
  if (value === "\\r\\n") return "\r\n";
  return "";
}

function setStatus(message, isConnected = Boolean(writeCharacteristic)) {
  supportText.textContent = message;
  statusStrip.classList.toggle("connected", isConnected);
  disconnectButton.disabled = !bluetoothDevice;
}

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logList.append(item);
}

function setControlsDisabled(disabled) {
  controlButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function validateSettings() {
  const serviceUuid = normalizeUuid(serviceUuidInput.value);
  const characteristicUuid = normalizeUuid(characteristicUuidInput.value);

  if (!serviceUuid || !characteristicUuid) {
    throw new Error("Enter both a service UUID and characteristic UUID.");
  }

  return { serviceUuid, characteristicUuid };
}

async function connect() {
  if (!navigator.bluetooth) {
    setStatus("Web Bluetooth is not available in this browser.");
    return;
  }

  const { serviceUuid, characteristicUuid } = validateSettings();
  const namePrefix = namePrefixInput.value.trim();
  const filters = namePrefix ? [{ namePrefix }] : [{ services: [serviceUuid] }];
  const optionalServices = namePrefix ? [serviceUuid] : [];

  setStatus("Opening Bluetooth device picker...");

  bluetoothDevice = await navigator.bluetooth.requestDevice({
    filters,
    optionalServices
  });

  bluetoothDevice.addEventListener("gattserverdisconnected", handleDisconnect);
  deviceName.textContent = bluetoothDevice.name || "Unnamed BLE device";
  setStatus("Connecting to GATT server...");

  const server = await bluetoothDevice.gatt.connect();
  const service = await server.getPrimaryService(serviceUuid);
  writeCharacteristic = await service.getCharacteristic(characteristicUuid);

  setStatus(`Connected to ${bluetoothDevice.name || "device"}.`, true);
  addLog(`Connected: ${bluetoothDevice.name || bluetoothDevice.id}`);
}

function handleDisconnect() {
  writeCharacteristic = null;
  bluetoothDevice = null;
  deviceName.textContent = "No device connected";
  setStatus("Device disconnected.", false);
  addLog("Disconnected");
}

async function disconnect() {
  if (bluetoothDevice?.gatt?.connected) {
    bluetoothDevice.gatt.disconnect();
    return;
  }

  handleDisconnect();
}

async function sendCommand(command) {
  if (!writeCharacteristic) {
    addLog(`Not connected: ${command}`);
    setStatus("Connect to a BLE device before sending commands.", false);
    return;
  }

  const payload = `${command}${decodeSuffix(commandSuffixInput.value)}`;

  try {
    await writeCharacteristic.writeValue(encoder.encode(payload));
    lastCommand.textContent = `Last command: ${command}`;
    addLog(`Sent: ${JSON.stringify(payload)}`);
  } catch (error) {
    setStatus(error.message || "Failed to send command.", false);
    addLog(`Send failed: ${command}`);
  }
}

function wireCommandButton(button) {
  const command = button.dataset.command;
  const activate = () => {
    button.classList.add("active");
    sendCommand(command);
  };
  const deactivate = () => button.classList.remove("active");

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    activate();
  });

  button.addEventListener("pointerup", deactivate);
  button.addEventListener("pointercancel", deactivate);
  button.addEventListener("lostpointercapture", deactivate);

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

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;

  try {
    await connect();
  } catch (error) {
    setStatus(error.message || "Bluetooth connection failed.");
    addLog(`Connection failed: ${error.message || "unknown error"}`);
  } finally {
    scanButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", disconnect);
clearLogButton.addEventListener("click", () => logList.replaceChildren());
controlButtons.forEach(wireCommandButton);
setControlsDisabled(false);

if (!navigator.bluetooth) {
  setStatus("Use Chrome or Edge over localhost/HTTPS for Web Bluetooth support.");
}
