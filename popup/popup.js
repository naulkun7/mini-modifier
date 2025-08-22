/**
 * Mini Modifier - Popup Script
 * Handles popup UI interactions and communication with background script
 */

// Tab elements
const modifyTab = document.getElementById("modifyTab");
const redirectTab = document.getElementById("redirectTab");
const modifyContent = document.getElementById("modifyContent");
const redirectContent = document.getElementById("redirectContent");

// Modify Response tab elements
const requestUrlInput = document.getElementById("requestUrl");
const urlSelect = document.getElementById("urlSelect");
const newResponseTextarea = document.getElementById("newResponse");
const responseSelect = document.getElementById("responseSelect");
const modeSelect = document.getElementById("modeSelect");
const toggleBtn = document.getElementById("toggleBtn");

// Redirect Request tab elements
const sourceUrlInput = document.getElementById("sourceUrl");
const sourceUrlSelect = document.getElementById("sourceUrlSelect");
const targetUrlInput = document.getElementById("targetUrl");
const targetUrlSelect = document.getElementById("targetUrlSelect");
const redirectMethodSelect = document.getElementById("redirectMethodSelect");
const redirectToggleBtn = document.getElementById("redirectToggleBtn");

// Common elements
const statusDiv = document.getElementById("status");

// Current tab ID and state
let currentTabId = null;
let activeTab = "modify"; // "modify" or "redirect"
let isModifyEnabled = false;
let isRedirectEnabled = false;
let savedUrls = [];
let savedResponses = [];

/**
 * Show status message with appropriate styling
 */
function showStatus(message, type = "info") {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove("hidden");
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  activeTab = tabName;

  // Update tab buttons
  modifyTab.classList.toggle("active", tabName === "modify");
  redirectTab.classList.toggle("active", tabName === "redirect");

  // Update tab content
  modifyContent.classList.toggle("active", tabName === "modify");
  redirectContent.classList.toggle("active", tabName === "redirect");

  // Update status based on active tab
  updateStatus();
}

/**
 * Update status based on current tab and state
 */
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

/**
 * Update toggle button appearance and text
 */
function updateToggleButton() {
  // Update modify response button
  if (isModifyEnabled) {
    toggleBtn.textContent = "Disable";
    toggleBtn.className = "toggle-btn enabled";
  } else {
    toggleBtn.textContent = "Enable";
    toggleBtn.className = "toggle-btn disabled";
  }

  // Update redirect request button
  if (isRedirectEnabled) {
    redirectToggleBtn.textContent = "Disable";
    redirectToggleBtn.className = "toggle-btn enabled";
  } else {
    redirectToggleBtn.textContent = "Enable";
    redirectToggleBtn.className = "toggle-btn disabled";
  }
}

/**
 * Load saved URLs from local JSON file
 */
async function loadSavedUrls() {
  try {
    // Load predefined URLs from JSON file
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

/**
 * Populate the URL dropdown with predefined URLs
 */
function populateUrlDropdown() {
  // Clear existing options except the first one
  urlSelect.innerHTML =
    '<option value="">-- Choose predefined URL or enter manually --</option>';

  // Add predefined URLs
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

/**
 * Handle URL selection from dropdown
 */
function handleUrlSelection() {
  const selectedUrl = urlSelect.value;
  if (selectedUrl) {
    requestUrlInput.value = selectedUrl;
  }
  saveFormData();
}

/**
 * Load saved responses from local JSON file
 */
async function loadSavedResponses() {
  try {
    // Load predefined responses from JSON file
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

/**
 * Populate the response dropdown with predefined responses
 */
function populateResponseDropdown() {
  // Clear existing options except the first one
  responseSelect.innerHTML =
    '<option value="">-- Choose predefined response or enter manually --</option>';

  // Add predefined responses
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

/**
 * Handle response selection from dropdown
 */
function handleResponseSelection() {
  const selectedResponse = responseSelect.value;
  if (selectedResponse) {
    newResponseTextarea.value = selectedResponse;
  }
  saveFormData();
}

/**
 * Hide status message
 */
function hideStatus() {
  statusDiv.classList.add("hidden");
}

/**
 * Save current form values to storage
 */
async function saveFormData() {
  const data = {
    requestUrl: requestUrlInput.value.trim(),
    newResponse: newResponseTextarea.value.trim(),
    mode: modeSelect.value,
    selectedUrlOption: urlSelect.value, // Save the dropdown selection
    selectedResponseOption: responseSelect.value, // Save the response dropdown selection
  };

  try {
    await chrome.storage.local.set({ formData: data });
  } catch (error) {
    console.warn("Failed to save form data:", error);
  }
}

/**
 * Load form values from storage
 */
async function loadFormData() {
  try {
    const result = await chrome.storage.local.get(["formData"]);
    const data = result.formData;

    if (data) {
      requestUrlInput.value = data.requestUrl || "";
      newResponseTextarea.value = data.newResponse || "";
      modeSelect.value = data.mode || "replace";

      // Restore URL dropdown selection
      if (data.selectedUrlOption) {
        urlSelect.value = data.selectedUrlOption;
      } else if (data.requestUrl) {
        // If no saved dropdown selection but we have a URL,
        // check if it matches any predefined URL and select it
        const matchingOption = Array.from(urlSelect.options).find(
          (option) => option.value === data.requestUrl
        );
        if (matchingOption) {
          urlSelect.value = data.requestUrl;
        }
      }

      // Restore response dropdown selection
      if (data.selectedResponseOption) {
        responseSelect.value = data.selectedResponseOption;
      } else if (data.newResponse) {
        // If no saved dropdown selection but we have a response,
        // check if it matches any predefined response and select it
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

/**
 * Validate form inputs
 */
function validateForm() {
  const url = requestUrlInput.value.trim();
  const response = newResponseTextarea.value.trim();

  // Check URL format
  try {
    new URL(url);
  } catch (urlError) {
    console.warn("Invalid URL format:", urlError.message);
    return { valid: false, error: "Please enter a valid URL" };
  }

  // Check JSON format
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

/**
 * Get current active tab
 */
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

/**
 * Check if interception is currently enabled for the current tab
 */
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

/**
 * Toggle interception on/off
 */
async function toggleInterception() {
  if (isModifyEnabled) {
    await disableInterception();
  } else {
    await enableInterception();
  }
}

/**
 * Enable interception
 */
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

/**
 * Disable interception
 */
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

/**
 * Handle source URL selection for redirect
 */
function handleSourceUrlSelection() {
  const selectedUrl = sourceUrlSelect.value;
  if (selectedUrl) {
    sourceUrlInput.value = selectedUrl;
  }
  saveRedirectFormData();
}

/**
 * Handle target URL selection for redirect
 */
function handleTargetUrlSelection() {
  const selectedUrl = targetUrlSelect.value;
  if (selectedUrl) {
    targetUrlInput.value = selectedUrl;
  }
  saveRedirectFormData();
}

/**
 * Save redirect form data
 */
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

/**
 * Load redirect form data
 */
async function loadRedirectFormData() {
  try {
    const result = await chrome.storage.local.get(["redirectFormData"]);
    const data = result.redirectFormData;

    if (data) {
      sourceUrlInput.value = data.sourceUrl || "";
      targetUrlInput.value = data.targetUrl || "";
      redirectMethodSelect.value = data.method || "GET";

      // Restore dropdown selections
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

/**
 * Toggle redirect on/off
 */
async function toggleRedirect() {
  if (isRedirectEnabled) {
    await disableRedirect();
  } else {
    await enableRedirect();
  }
}

/**
 * Enable redirect
 */
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

/**
 * Disable redirect
 */
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

/**
 * Populate dropdowns for redirect tab
 */
function populateRedirectDropdowns() {
  // Populate source URL dropdown
  sourceUrlSelect.innerHTML =
    '<option value="">-- Choose predefined URL or enter manually --</option>';

  // Populate target URL dropdown
  targetUrlSelect.innerHTML =
    '<option value="">-- Choose predefined URL or enter manually --</option>';

  // Add predefined URLs to both dropdowns
  if (savedUrls.length > 0) {
    savedUrls.forEach((urlData) => {
      // Source dropdown
      const sourceOption = document.createElement("option");
      sourceOption.value = urlData.url;
      sourceOption.textContent = urlData.name || urlData.url;
      if (urlData.description) {
        sourceOption.title = urlData.description;
      }
      sourceUrlSelect.appendChild(sourceOption);

      // Target dropdown
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

/**
 * Initialize popup
 */
async function init() {
  // Get current tab
  const tab = await getCurrentTab();
  if (tab) {
    currentTabId = tab.id;
  } else {
    showStatus("Failed to get active tab", "error");
    return;
  }

  // Load saved URLs and responses first (so dropdown options exist)
  await loadSavedUrls();
  await loadSavedResponses();

  // Populate dropdowns for both tabs
  populateRedirectDropdowns();

  // Then load saved form data (which may select dropdown options)
  await loadFormData();
  await loadRedirectFormData();

  // Check current status
  await checkStatus();

  // Set up tab switching
  modifyTab.addEventListener("click", () => switchTab("modify"));
  redirectTab.addEventListener("click", () => switchTab("redirect"));

  // Set up event listeners for modify tab
  toggleBtn.addEventListener("click", toggleInterception);
  urlSelect.addEventListener("change", handleUrlSelection);
  responseSelect.addEventListener("change", handleResponseSelection);

  // Set up event listeners for redirect tab
  redirectToggleBtn.addEventListener("click", toggleRedirect);
  sourceUrlSelect.addEventListener("change", handleSourceUrlSelection);
  targetUrlSelect.addEventListener("change", handleTargetUrlSelection);

  // Save form data on changes - modify tab
  requestUrlInput.addEventListener("input", saveFormData);
  newResponseTextarea.addEventListener("input", saveFormData);
  modeSelect.addEventListener("change", saveFormData);

  // Save form data on changes - redirect tab
  sourceUrlInput.addEventListener("input", saveRedirectFormData);
  targetUrlInput.addEventListener("input", saveRedirectFormData);
  redirectMethodSelect.addEventListener("change", saveRedirectFormData);

  // Initialize with modify tab active
  switchTab("modify");

  // Example data for first-time users
  if (!requestUrlInput.value && !newResponseTextarea.value) {
    requestUrlInput.value = "https://jsonplaceholder.typicode.com/posts/1";
    newResponseTextarea.value = '{"modified": true, "status": "intercepted"}';
    modeSelect.value = "replace"; // Set default mode

    // Set the dropdowns to match the example data
    urlSelect.value = "https://jsonplaceholder.typicode.com/posts/1";
    responseSelect.value = '{"modified": true, "status": "intercepted"}';

    await saveFormData();
  }
}

// Initialize when popup loads
document.addEventListener("DOMContentLoaded", init);
