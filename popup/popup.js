const modifyTab = document.getElementById("modifyTab");
const redirectTab = document.getElementById("redirectTab");
const modifyContent = document.getElementById("modifyContent");
const redirectContent = document.getElementById("redirectContent");

const requestUrlInput = document.getElementById("requestUrl");
const newResponseTextarea = document.getElementById("newResponse");
const modeSelect = document.getElementById("modeSelect");
const statusCodeInput = document.getElementById("statusCode");
const statusCodeToggle = document.getElementById("statusCodeEnabled");
const toggleBtn = document.getElementById("toggleBtn");

const sourceUrlInput = document.getElementById("sourceUrl");
const targetUrlInput = document.getElementById("targetUrl");
const redirectMethodSelect = document.getElementById("redirectMethodSelect");
const redirectToggleBtn = document.getElementById("redirectToggleBtn");

const statusDiv = document.getElementById("status");

let currentTabId = null;
let activeTab = "modify";
let isModifyEnabled = false;
let isRedirectEnabled = false;
let lastStatusCodeValue = "";

function updateStatusCodeState() {
  const manualAllowed =
    statusCodeToggle.checked && !isModifyEnabled && !statusCodeToggle.disabled;

  statusCodeInput.readOnly = !manualAllowed;
  statusCodeInput.toggleAttribute("readonly", !manualAllowed);
  statusCodeInput.disabled = isModifyEnabled;
  statusCodeInput.classList.toggle("status-input-disabled", !manualAllowed);

  if (manualAllowed && !statusCodeInput.value && lastStatusCodeValue) {
    statusCodeInput.value = lastStatusCodeValue;
  }
}

function handleStatusCodeToggle() {
  updateStatusCodeState();
  if (!statusCodeToggle.checked) {
    lastStatusCodeValue = statusCodeInput.value.trim();
    statusCodeInput.value = "";
  } else if (!statusCodeInput.value && lastStatusCodeValue) {
    statusCodeInput.value = lastStatusCodeValue;
  }
  saveFormData();
}

function handleStatusCodeInput() {
  if (statusCodeToggle.checked) {
    lastStatusCodeValue = statusCodeInput.value.trim();
  }
  saveFormData();
}

async function maybeForceDetach() {
  if (!currentTabId) return;

  try {
    const status = await chrome.runtime.sendMessage({
      action: "getStatus",
      tabId: currentTabId,
    });

    const modifyActive = Boolean(status.modifyActive);
    const redirectActive = Boolean(status.redirectActive);

    if (!modifyActive && !redirectActive) {
      await chrome.runtime.sendMessage({
        action: "forceDetach",
        tabId: currentTabId,
      });
    }
  } catch (error) {
    console.warn("Failed to force detach debugger:", error);
  }
}

async function ensureDebuggerDetached() {
  await maybeForceDetach();
}

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
  if (!statusDiv.classList.contains("error")) {
    hideStatus();
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

  updateEnabledStyles();
  updateFormInteractivity();
}

function updateEnabledStyles() {
  modifyContent.classList.toggle("enabled-indicator", isModifyEnabled);
  redirectContent.classList.toggle(
    "enabled-indicator",
    isRedirectEnabled
  );
}

function setDisabled(elements, disabled) {
  elements.forEach((el) => {
    if (el) {
      el.disabled = disabled;
    }
  });
}

function updateModifyInputsState() {
  const disabled = isModifyEnabled;
  setDisabled([requestUrlInput, newResponseTextarea, modeSelect], disabled);
  statusCodeToggle.disabled = disabled;
  updateStatusCodeState();
}

function updateRedirectInputsState() {
  const disabled = isRedirectEnabled;
  setDisabled(
    [sourceUrlInput, targetUrlInput, redirectMethodSelect],
    disabled
  );
}

function updateFormInteractivity() {
  updateModifyInputsState();
  updateRedirectInputsState();
}

function hideStatus() {
  statusDiv.classList.add("hidden");
}

async function saveFormData() {
  const data = {
    requestUrl: requestUrlInput.value.trim(),
    newResponse: newResponseTextarea.value.trim(),
    mode: modeSelect.value,
    statusCode: statusCodeInput.value.trim(),
    statusCodeEnabled: statusCodeToggle.checked,
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
    const statusCodeEnabled = data
      ? data.statusCodeEnabled !== undefined
        ? Boolean(data.statusCodeEnabled)
        : Boolean((data.statusCode || "").trim())
      : false;

    if (data) {
      requestUrlInput.value = data.requestUrl || "";
      newResponseTextarea.value = data.newResponse || "";
      modeSelect.value = data.mode || "replace";
      statusCodeInput.value = data.statusCode || "";
      lastStatusCodeValue = statusCodeInput.value.trim();
    } else {
      statusCodeInput.value = "";
      lastStatusCodeValue = "";
    }

    statusCodeToggle.checked = statusCodeEnabled;
    updateStatusCodeState();
  } catch (error) {
    console.warn("Failed to load form data:", error);
  }
}

function validateForm() {
  const url = requestUrlInput.value.trim();
  const response = newResponseTextarea.value.trim();
  const statusCodeRaw = statusCodeInput.value.trim();

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

  if (statusCodeToggle.checked) {
    if (!statusCodeRaw) {
      return { valid: false, error: "Enter a status code or disable the toggle" };
    }
    const parsedCode = Number.parseInt(statusCodeRaw, 10);
    if (
      !Number.isInteger(parsedCode) ||
      parsedCode < 100 ||
      parsedCode > 599
    ) {
      return {
        valid: false,
        error: "Status code must be between 100 and 599",
      };
    }
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

    isModifyEnabled =
      typeof response.modifyActive === "boolean"
        ? response.modifyActive
        : Boolean(response.isAttached);
    isRedirectEnabled = Boolean(response.redirectActive);
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

async function enableInterception(options = {}) {
  const { silent = false } = options;
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
  const statusCodeOverride = statusCodeToggle.checked
    ? statusCodeInput.value.trim() || null
    : null;

  if (!silent) {
    showStatus("Enabling...", "info");
    toggleBtn.disabled = true;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: "enable",
      tabId: currentTabId,
      url: url,
      overrideData: overrideData,
      mode: mode,
      statusCodeOverride,
    });

    if (response.success) {
      isModifyEnabled = true;
      updateToggleButton();
      hideStatus();
      await saveFormData();
    } else {
      showStatus(`Failed: ${response.error}`, "error");
    }
  } catch (error) {
    console.error("Failed to enable interception:", error);
    showStatus("Failed to communicate with background script", "error");
  } finally {
    if (!silent) {
      toggleBtn.disabled = false;
    }
  }
}

async function refreshModifyIfActive() {}

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
      await ensureDebuggerDetached();
      hideStatus();
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

async function saveRedirectFormData() {
  const data = {
    sourceUrl: sourceUrlInput.value.trim(),
    targetUrl: targetUrlInput.value.trim(),
    method: redirectMethodSelect.value,
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
      redirectMethodSelect.value = data.method || "";
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
  const methodSelection = redirectMethodSelect.value.trim().toUpperCase();
  const method = methodSelection || null;

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
      hideStatus();
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
      await ensureDebuggerDetached();
      hideStatus();
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

async function init() {
  const tab = await getCurrentTab();
  if (tab) {
    currentTabId = tab.id;
  } else {
    showStatus("Failed to get active tab", "error");
    return;
  }

  await loadFormData();
  await loadRedirectFormData();

  await checkStatus();

  modifyTab.addEventListener("click", () => switchTab("modify"));
  redirectTab.addEventListener("click", () => switchTab("redirect"));

  toggleBtn.addEventListener("click", toggleInterception);
  statusCodeInput.addEventListener("input", handleStatusCodeInput);
  statusCodeInput.addEventListener("change", handleStatusCodeInput);
  statusCodeToggle.addEventListener("change", handleStatusCodeToggle);

  redirectToggleBtn.addEventListener("click", toggleRedirect);

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
    statusCodeInput.value = "200";
    lastStatusCodeValue = "200";
    statusCodeToggle.checked = true;
    updateStatusCodeState();

    await saveFormData();
  }
}

document.addEventListener("DOMContentLoaded", init);
