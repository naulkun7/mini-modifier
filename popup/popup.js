const modifyTab = document.getElementById("modifyTab");
const redirectTab = document.getElementById("redirectTab");
const modifyContent = document.getElementById("modifyContent");
const redirectContent = document.getElementById("redirectContent");

const requestUrlInput = document.getElementById("requestUrl");
const urlSelect = document.getElementById("urlSelect");
const newResponseTextarea = document.getElementById("newResponse");
const responseSelect = document.getElementById("responseSelect");
const modeSelect = document.getElementById("modeSelect");
const toggleBtn = document.getElementById("toggleBtn");

const sourceUrlInput = document.getElementById("sourceUrl");
const sourceUrlSelect = document.getElementById("sourceUrlSelect");
const targetUrlInput = document.getElementById("targetUrl");
const targetUrlSelect = document.getElementById("targetUrlSelect");
const redirectMethodSelect = document.getElementById("redirectMethodSelect");
const redirectToggleBtn = document.getElementById("redirectToggleBtn");

const statusDiv = document.getElementById("status");

let currentTabId = null;
let activeTab = "modify";
let isModifyEnabled = false;
let isRedirectEnabled = false;
let savedUrls = [];
let savedResponses = [];

function showStatus(message, type = "info") {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove("hidden");
}

function switchTab(tabName) {
  activeTab = tabName;

  modifyTab.classList.toggle("active", tabName === "modify");
  redirectTab.classList.toggle("active", tabName === "redirect");

  modifyContent.classList.toggle("active", tabName === "modify");
  redirectContent.classList.toggle("active", tabName === "redirect");

  updateStatus();
}

function updateStatus() {
  if (activeTab === "modify") {
    if (isModifyEnabled) {
      showStatus("Modify Response: Enabled", "success");
    } else {
      showStatus("Ready to modify responses", "info");
    }
  } else if (activeTab === "redirect") {
    if (isRedirectEnabled) {
      showStatus("Redirect Request: Enabled", "success");
    } else {
      showStatus("Ready to redirect requests", "info");
    }
  }
}

function updateToggleButton() {
  if (isModifyEnabled) {
    toggleBtn.textContent = "Disable";
    toggleBtn.className = "toggle-btn enabled";
  } else {
    toggleBtn.textContent = "Enable";
    toggleBtn.className = "toggle-btn disabled";
  }

  if (isRedirectEnabled) {
    redirectToggleBtn.textContent = "Disable";
    redirectToggleBtn.className = "toggle-btn enabled";
  } else {
    redirectToggleBtn.textContent = "Enable";
    redirectToggleBtn.className = "toggle-btn disabled";
  }
}

async function loadSavedUrls() {
  try {
    const response = await fetch(
      chrome.runtime.getURL("../local/saved-urls.json")
    );
    const data = await response.json();

    savedUrls = data.savedUrls || [];

    populateUrlDropdown();
  } catch (error) {
    console.warn("Failed to load saved URLs:", error);
    savedUrls = [];
  }
}

function populateUrlDropdown() {
  urlSelect.innerHTML =
    '<option value="">-- Choose predefined URL or enter manually --</option>';

  if (savedUrls.length > 0) {
    savedUrls.forEach((urlData) => {
      const option = document.createElement("option");
      option.value = urlData.url;
      option.textContent = urlData.name || urlData.url;
      if (urlData.description) {
        option.title = urlData.description;
      }
      urlSelect.appendChild(option);
    });
  }
}

function handleUrlSelection() {
  const selectedUrl = urlSelect.value;
  if (selectedUrl) {
    requestUrlInput.value = selectedUrl;
  }
  saveFormData();
}

async function loadSavedResponses() {
  try {
    const response = await fetch(
      chrome.runtime.getURL("../local/saved-responses.json")
    );
    const data = await response.json();

    savedResponses = data.savedResponses || [];

    populateResponseDropdown();
  } catch (error) {
    console.warn("Failed to load saved responses:", error);
    savedResponses = [];
  }
}

function populateResponseDropdown() {
  responseSelect.innerHTML =
    '<option value="">-- Choose predefined response or enter manually --</option>';

  if (savedResponses.length > 0) {
    savedResponses.forEach((responseData) => {
      const option = document.createElement("option");
      option.value = responseData.response;
      option.textContent = responseData.name || "Unnamed Response";
      if (responseData.description) {
        option.title = responseData.description;
      }
      responseSelect.appendChild(option);
    });
  }
}

function handleResponseSelection() {
  const selectedResponse = responseSelect.value;
  if (selectedResponse) {
    newResponseTextarea.value = selectedResponse;
  }
  saveFormData();
}

function hideStatus() {
  statusDiv.classList.add("hidden");
}

async function saveFormData() {
  const data = {
    requestUrl: requestUrlInput.value.trim(),
    newResponse: newResponseTextarea.value.trim(),
    mode: modeSelect.value,
    selectedUrlOption: urlSelect.value,
    selectedResponseOption: responseSelect.value,
  };

  try {
    await chrome.storage.local.set({ formData: data });
  } catch (error) {
    console.warn("Failed to save form data:", error);
  }
}

async function loadFormData() {
  try {
    const result = await chrome.storage.local.get(["formData"]);
    const data = result.formData;

    if (data) {
      requestUrlInput.value = data.requestUrl || "";
      newResponseTextarea.value = data.newResponse || "";
      modeSelect.value = data.mode || "replace";

      if (data.selectedUrlOption) {
        urlSelect.value = data.selectedUrlOption;
      } else if (data.requestUrl) {
        const matchingOption = Array.from(urlSelect.options).find(
          (option) => option.value === data.requestUrl
        );
        if (matchingOption) {
          urlSelect.value = data.requestUrl;
        }
      }

      if (data.selectedResponseOption) {
        responseSelect.value = data.selectedResponseOption;
      } else if (data.newResponse) {
        const matchingResponseOption = Array.from(responseSelect.options).find(
          (option) => option.value === data.newResponse
        );
        if (matchingResponseOption) {
          responseSelect.value = data.newResponse;
        }
      }
    }
  } catch (error) {
    console.warn("Failed to load form data:", error);
  }
}

function validateForm() {
  const url = requestUrlInput.value.trim();
  const response = newResponseTextarea.value.trim();

  try {
    new URL(url);
  } catch (urlError) {
    console.warn("Invalid URL format:", urlError.message);
    return { valid: false, error: "Please enter a valid URL" };
  }

  if (!response) {
    return { valid: false, error: "Please enter a JSON response" };
  }

  try {
    JSON.parse(response);
  } catch (jsonError) {
    console.warn("Invalid JSON format:", jsonError.message);
    return { valid: false, error: "Invalid JSON format in response" };
  }

  return { valid: true };
}

async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  } catch (error) {
    console.error("Failed to get current tab:", error);
    return null;
  }
}

async function checkStatus() {
  if (!currentTabId) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "getStatus",
      tabId: currentTabId,
    });

    isModifyEnabled = response.isAttached;
    updateToggleButton();
    updateStatus();
  } catch (error) {
    console.error("Failed to check status:", error);
    showStatus("Error checking status", "error");
  }
}

async function toggleInterception() {
  if (isModifyEnabled) {
    await disableInterception();
  } else {
    await enableInterception();
  }
}

async function enableInterception() {
  const validation = validateForm();
  if (!validation.valid) {
    showStatus(validation.error, "error");
    return;
  }

  if (!currentTabId) {
    showStatus("No active tab found", "error");
    return;
  }

  const url = requestUrlInput.value.trim();
  const overrideData = newResponseTextarea.value.trim();
  const mode = modeSelect.value;

  showStatus("Enabling...", "info");
  toggleBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "enable",
      tabId: currentTabId,
      url: url,
      overrideData: overrideData,
      mode: mode,
    });

    if (response.success) {
      isModifyEnabled = true;
      updateToggleButton();
      showStatus(`Enabled: ${url}`, "success");
      await saveFormData();
    } else {
      showStatus(`Failed: ${response.error}`, "error");
    }
  } catch (error) {
    console.error("Failed to enable interception:", error);
    showStatus("Failed to communicate with background script", "error");
  } finally {
    toggleBtn.disabled = false;
  }
}

async function disableInterception() {
  if (!currentTabId) {
    showStatus("No active tab found", "error");
    return;
  }

  showStatus("Disabling...", "info");
  toggleBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "disable",
      tabId: currentTabId,
    });

    if (response.success) {
      isModifyEnabled = false;
      updateToggleButton();
      updateStatus();
    } else {
      showStatus(`Failed: ${response.error}`, "error");
    }
  } catch (error) {
    console.error("Failed to disable interception:", error);
    showStatus("Failed to communicate with background script", "error");
  } finally {
    toggleBtn.disabled = false;
  }
}

function handleSourceUrlSelection() {
  const selectedUrl = sourceUrlSelect.value;
  if (selectedUrl) {
    sourceUrlInput.value = selectedUrl;
  }
  saveRedirectFormData();
}

function handleTargetUrlSelection() {
  const selectedUrl = targetUrlSelect.value;
  if (selectedUrl) {
    targetUrlInput.value = selectedUrl;
  }
  saveRedirectFormData();
}

async function saveRedirectFormData() {
  const data = {
    sourceUrl: sourceUrlInput.value.trim(),
    targetUrl: targetUrlInput.value.trim(),
    method: redirectMethodSelect.value,
    selectedSourceUrlOption: sourceUrlSelect.value,
    selectedTargetUrlOption: targetUrlSelect.value,
  };

  try {
    await chrome.storage.local.set({ redirectFormData: data });
  } catch (error) {
    console.warn("Failed to save redirect form data:", error);
  }
}

async function loadRedirectFormData() {
  try {
    const result = await chrome.storage.local.get(["redirectFormData"]);
    const data = result.redirectFormData;

    if (data) {
      sourceUrlInput.value = data.sourceUrl || "";
      targetUrlInput.value = data.targetUrl || "";
      redirectMethodSelect.value = data.method || "GET";

      if (data.selectedSourceUrlOption) {
        sourceUrlSelect.value = data.selectedSourceUrlOption;
      }
      if (data.selectedTargetUrlOption) {
        targetUrlSelect.value = data.selectedTargetUrlOption;
      }
    }
  } catch (error) {
    console.warn("Failed to load redirect form data:", error);
  }
}

async function toggleRedirect() {
  if (isRedirectEnabled) {
    await disableRedirect();
  } else {
    await enableRedirect();
  }
}

async function enableRedirect() {
  const sourceUrl = sourceUrlInput.value.trim();
  const targetUrl = targetUrlInput.value.trim();
  const method = redirectMethodSelect.value;

  if (!sourceUrl || !targetUrl) {
    showStatus("Please enter both source and target URLs", "error");
    return;
  }

  if (!currentTabId) {
    showStatus("No active tab found", "error");
    return;
  }

  showStatus("Enabling redirect...", "info");
  redirectToggleBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "enableRedirect",
      tabId: currentTabId,
      sourceUrl: sourceUrl,
      targetUrl: targetUrl,
      method: method,
    });

    if (response.success) {
      isRedirectEnabled = true;
      updateToggleButton();
      showStatus(`Redirecting: ${sourceUrl} → ${targetUrl}`, "success");
      await saveRedirectFormData();
    } else {
      showStatus(`Failed: ${response.error}`, "error");
    }
  } catch (error) {
    console.error("Failed to enable redirect:", error);
    showStatus("Failed to communicate with background script", "error");
  } finally {
    redirectToggleBtn.disabled = false;
  }
}

async function disableRedirect() {
  if (!currentTabId) {
    showStatus("No active tab found", "error");
    return;
  }

  showStatus("Disabling redirect...", "info");
  redirectToggleBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "disableRedirect",
      tabId: currentTabId,
    });

    if (response.success) {
      isRedirectEnabled = false;
      updateToggleButton();
      updateStatus();
    } else {
      showStatus(`Failed: ${response.error}`, "error");
    }
  } catch (error) {
    console.error("Failed to disable redirect:", error);
    showStatus("Failed to communicate with background script", "error");
  } finally {
    redirectToggleBtn.disabled = false;
  }
}

function populateRedirectDropdowns() {
  sourceUrlSelect.innerHTML =
    '<option value="">-- Choose predefined URL or enter manually --</option>';

  targetUrlSelect.innerHTML =
    '<option value="">-- Choose predefined URL or enter manually --</option>';

  if (savedUrls.length > 0) {
    savedUrls.forEach((urlData) => {
      const sourceOption = document.createElement("option");
      sourceOption.value = urlData.url;
      sourceOption.textContent = urlData.name || urlData.url;
      if (urlData.description) {
        sourceOption.title = urlData.description;
      }
      sourceUrlSelect.appendChild(sourceOption);

      const targetOption = document.createElement("option");
      targetOption.value = urlData.url;
      targetOption.textContent = urlData.name || urlData.url;
      if (urlData.description) {
        targetOption.title = urlData.description;
      }
      targetUrlSelect.appendChild(targetOption);
    });
  }
}

async function init() {
  const tab = await getCurrentTab();
  if (tab) {
    currentTabId = tab.id;
  } else {
    showStatus("Failed to get active tab", "error");
    return;
  }

  await loadSavedUrls();
  await loadSavedResponses();

  populateRedirectDropdowns();

  await loadFormData();
  await loadRedirectFormData();

  await checkStatus();

  modifyTab.addEventListener("click", () => switchTab("modify"));
  redirectTab.addEventListener("click", () => switchTab("redirect"));

  toggleBtn.addEventListener("click", toggleInterception);
  urlSelect.addEventListener("change", handleUrlSelection);
  responseSelect.addEventListener("change", handleResponseSelection);

  redirectToggleBtn.addEventListener("click", toggleRedirect);
  sourceUrlSelect.addEventListener("change", handleSourceUrlSelection);
  targetUrlSelect.addEventListener("change", handleTargetUrlSelection);

  requestUrlInput.addEventListener("input", saveFormData);
  newResponseTextarea.addEventListener("input", saveFormData);
  modeSelect.addEventListener("change", saveFormData);

  sourceUrlInput.addEventListener("input", saveRedirectFormData);
  targetUrlInput.addEventListener("input", saveRedirectFormData);
  redirectMethodSelect.addEventListener("change", saveRedirectFormData);

  switchTab("modify");

  if (!requestUrlInput.value && !newResponseTextarea.value) {
    requestUrlInput.value = "https://jsonplaceholder.typicode.com/posts/1";
    newResponseTextarea.value = '{"modified": true, "status": "intercepted"}';
    modeSelect.value = "replace";

    urlSelect.value = "https://jsonplaceholder.typicode.com/posts/1";
    responseSelect.value = '{"modified": true, "status": "intercepted"}';

    await saveFormData();
  }
}

document.addEventListener("DOMContentLoaded", init);
