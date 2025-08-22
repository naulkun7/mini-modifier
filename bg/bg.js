/**
 * Mini Modifier - Background Service Worker
 * Handles Chrome DevTools Protocol (CDP) interaction for intercepting and modifying API responses
 */

// Track attached tabs and their event listeners
const attachedTabs = new Map(); // tabId -> { listener: function, targetUrl: string }
const redirectRules = new Map(); // tabId -> { sourceUrl: string, targetUrl: string, method: string }

/**
 * Safely parse JSON string, return null on failure
 */
function safeParseJSON(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn("Failed to parse JSON:", error.message);
    return null;
  }
}

/**
 * Merge headers while preserving originals and overriding content-type
 */
function mergeHeaders(originalHeaders = [], overrides = {}) {
  const headers = [...originalHeaders];

  // Override content-type for JSON
  const contentTypeOverride = {
    name: "content-type",
    value: "application/json; charset=utf-8",
  };

  // Find existing content-type header and replace it
  const contentTypeIndex = headers.findIndex(
    (h) => h.name.toLowerCase() === "content-type"
  );
  if (contentTypeIndex !== -1) {
    headers[contentTypeIndex] = contentTypeOverride;
  } else {
    headers.push(contentTypeOverride);
  }

  // Add any additional overrides
  for (const [name, value] of Object.entries(overrides)) {
    if (name.toLowerCase() !== "content-type") {
      const existingIndex = headers.findIndex(
        (h) => h.name.toLowerCase() === name.toLowerCase()
      );
      if (existingIndex !== -1) {
        headers[existingIndex] = { name, value };
      } else {
        headers.push({ name, value });
      }
    }
  }

  return headers;
}

/**
 * Convert string to base64 for CDP fulfillRequest
 */
function stringToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Create event listener for handling CDP Fetch events
 */
function createFetchEventListener(tabId, targetUrl, overrideData, mode) {
  return async (source, method, params) => {
    // Only handle events for this specific tab
    if (source.tabId !== tabId) return;

    // Only handle Fetch.requestPaused events
    if (method !== "Fetch.requestPaused") return;

    const { requestId, request, responseStatusCode, responseHeaders } = params;

    // Only intercept responses (not requests)
    if (!responseStatusCode) {
      try {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId,
        });
      } catch (error) {
        console.warn("Failed to continue request:", error);
      }
      return;
    }

    // Check if this is our target URL
    if (request.url !== targetUrl) {
      try {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId,
        });
      } catch (error) {
        console.warn("Failed to continue request:", error);
      }
      return;
    }

    console.log(`Intercepting response for: ${request.url}`);

    try {
      // Get the original response body
      const responseBody = await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.getResponseBody",
        { requestId }
      );

      let originalBodyText = "";

      // Handle base64 encoded responses
      if (responseBody.base64Encoded) {
        try {
          originalBodyText = atob(responseBody.body);
        } catch (error) {
          console.warn(
            "Failed to decode base64 response, continuing without modification",
            error
          );
          // Handle the specific error by logging details and continuing with original response
          await chrome.debugger.sendCommand(
            { tabId },
            "Fetch.continueRequest",
            { requestId }
          );
          return;
        }
      } else {
        originalBodyText = responseBody.body;
      }

      let newBodyText;

      if (mode === "replace") {
        // Replace mode: use override data directly
        newBodyText =
          typeof overrideData === "string"
            ? overrideData
            : JSON.stringify(overrideData);
      } else {
        // Merge mode: merge with original JSON
        const originalJson = safeParseJSON(originalBodyText);

        if (originalJson === null) {
          // Original isn't valid JSON, fall back to replace mode
          console.warn(
            "Original response is not valid JSON, falling back to replace mode"
          );
          newBodyText =
            typeof overrideData === "string"
              ? overrideData
              : JSON.stringify(overrideData);
        } else {
          // Parse override data
          const overrideJson =
            typeof overrideData === "string"
              ? safeParseJSON(overrideData)
              : overrideData;

          if (overrideJson === null) {
            console.warn(
              "Override data is not valid JSON, continuing without modification"
            );
            await chrome.debugger.sendCommand(
              { tabId },
              "Fetch.continueRequest",
              { requestId }
            );
            return;
          }

          // Shallow merge: override properties take precedence
          const mergedJson = { ...originalJson, ...overrideJson };
          newBodyText = JSON.stringify(mergedJson);
        }
      }

      // Validate final JSON before sending
      if (safeParseJSON(newBodyText) === null) {
        console.warn("Final JSON is invalid, continuing without modification");
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId,
        });
        return;
      }

      // Prepare modified headers
      const modifiedHeaders = mergeHeaders(responseHeaders);

      // Fulfill the request with modified response
      await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
        requestId,
        responseCode: responseStatusCode,
        responseHeaders: modifiedHeaders,
        body: stringToBase64(newBodyText),
      });

      console.log("Successfully modified response for:", request.url);
    } catch (error) {
      console.error("Error modifying response:", error);
      // Fall back to continuing without modification
      try {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId,
        });
      } catch (continueError) {
        console.error("Failed to continue request after error:", continueError);
      }
    }
  };
}

/**
 * Enable interception for a specific tab and URL
 */
async function enableInterception(tabId, url, overrideData, mode) {
  try {
    // Disable first if already attached to avoid double-attachment
    await disableInterception(tabId);

    // Attach debugger to tab
    await chrome.debugger.attach({ tabId }, "1.3");
    console.log(`Debugger attached to tab ${tabId}`);

    // Enable Fetch domain with specific URL pattern
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [
        {
          urlPattern: url,
          requestStage: "Response",
        },
      ],
    });
    console.log(`Fetch enabled for URL pattern: ${url}`);

    // Create and register event listener
    const listener = createFetchEventListener(tabId, url, overrideData, mode);
    chrome.debugger.onEvent.addListener(listener);

    // Store tab state
    attachedTabs.set(tabId, {
      listener,
      targetUrl: url,
    });

    console.log(
      `Interception enabled for tab ${tabId}, URL: ${url}, mode: ${mode}`
    );
    return { success: true };
  } catch (error) {
    console.error("Failed to enable interception:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Disable interception for a specific tab
 */
async function disableInterception(tabId) {
  try {
    const tabState = attachedTabs.get(tabId);

    if (tabState) {
      // Remove event listener
      chrome.debugger.onEvent.removeListener(tabState.listener);

      // Remove from tracking
      attachedTabs.delete(tabId);
    }

    // Try to disable Fetch and detach debugger
    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.disable");
    } catch (error) {
      // Ignore if already disabled or if the debugger is no longer attached
      console.log(`Fetch.disable failed for tab ${tabId}: ${error.message}`);
    }

    try {
      await chrome.debugger.detach({ tabId });
    } catch (error) {
      // Ignore if already detached
    }

    console.log(`Interception disabled for tab ${tabId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to disable interception:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle debugger detach events (e.g., tab closed, user action)
 */
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  console.log(`Debugger detached from tab ${tabId}, reason: ${reason}`);

  // Clean up our tracking
  const tabState = attachedTabs.get(tabId);
  if (tabState) {
    chrome.debugger.onEvent.removeListener(tabState.listener);
    attachedTabs.delete(tabId);
  }
});

/**
 * Enable request redirection for a specific tab
 */
async function enableRedirection(tabId, sourceUrl, targetUrl, method = "GET") {
  try {
    // First disable any existing redirect for this tab
    await disableRedirection(tabId);

    // Attach debugger if not already attached
    if (!attachedTabs.has(tabId)) {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Fetch.enable");
    }

    // Store redirect rule
    redirectRules.set(tabId, { sourceUrl, targetUrl, method });

    // Create request interception listener
    const listener = (source, method, params) => {
      if (source.tabId === tabId && method === "Fetch.requestPaused") {
        handleRedirectRequest(tabId, params);
      }
    };

    // Add listener and enable request interception
    chrome.debugger.onEvent.addListener(listener);
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [{ urlPattern: "*" }],
    });

    // Update tracking
    attachedTabs.set(tabId, {
      listener,
      targetUrl: sourceUrl,
      type: "redirect",
    });

    console.log(
      `Redirect enabled for tab ${tabId}: ${sourceUrl} → ${targetUrl}`
    );
    return { success: true };
  } catch (error) {
    console.error("Failed to enable redirection:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Disable request redirection for a specific tab
 */
async function disableRedirection(tabId) {
  try {
    const tabData = attachedTabs.get(tabId);
    if (tabData && tabData.type === "redirect") {
      // Remove event listener
      chrome.debugger.onEvent.removeListener(tabData.listener);

      // Disable fetch and detach debugger
      await chrome.debugger.sendCommand({ tabId }, "Fetch.disable");
      await chrome.debugger.detach({ tabId });

      // Clean up tracking
      attachedTabs.delete(tabId);
      redirectRules.delete(tabId);

      console.log(`Redirect disabled for tab ${tabId}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to disable redirection:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle intercepted request for redirection
 */
async function handleRedirectRequest(tabId, params) {
  const redirectRule = redirectRules.get(tabId);
  if (!redirectRule) {
    // Continue with original request if no redirect rule
    chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
      requestId: params.requestId,
    });
    return;
  }

  const { sourceUrl, targetUrl } = redirectRule;
  const requestUrl = params.request.url;

  // Check if this request matches our source URL pattern
  if (requestUrl.includes(sourceUrl) || requestUrl === sourceUrl) {
    console.log(`Redirecting request: ${requestUrl} → ${targetUrl}`);

    try {
      // Fulfill the request with a redirect
      await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 302,
        responseHeaders: [
          { name: "Location", value: targetUrl },
          { name: "content-type", value: "text/html" },
        ],
        body: btoa(`<html><body>Redirecting to ${targetUrl}</body></html>`),
      });
    } catch (error) {
      console.error("Failed to fulfill redirect request:", error);
      // Fallback: continue with original request
      chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
        requestId: params.requestId,
      });
    }
  } else {
    // Continue with original request
    chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
      requestId: params.requestId,
    });
  }
}

/**
 * Message handler for popup communication
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const {
    action,
    tabId,
    url,
    overrideData,
    mode,
    sourceUrl,
    targetUrl,
    method,
  } = message;

  if (action === "enable") {
    enableInterception(tabId, url, overrideData, mode).then((result) =>
      sendResponse(result)
    );
    return true; // Async response
  } else if (action === "disable") {
    disableInterception(tabId).then((result) => sendResponse(result));
    return true; // Async response
  } else if (action === "enableRedirect") {
    enableRedirection(tabId, sourceUrl, targetUrl, method).then((result) =>
      sendResponse(result)
    );
    return true; // Async response
  } else if (action === "disableRedirect") {
    disableRedirection(tabId).then((result) => sendResponse(result));
    return true; // Async response
  } else if (action === "getStatus") {
    const isAttached = attachedTabs.has(tabId);
    const targetUrl = isAttached ? attachedTabs.get(tabId).targetUrl : null;
    sendResponse({ isAttached, targetUrl });
  } else {
    sendResponse({ success: false, error: "Unknown action" });
  }
});

// TODO: Add compression support (gzip/deflate/br)
// TODO: Add find & replace mode for text manipulation
// TODO: Add logging panel functionality
// TODO: Add "continue without modification on error" toggle
