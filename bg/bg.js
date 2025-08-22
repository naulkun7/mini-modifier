const attachedTabs = new Map();
const redirectRules = new Map();

function safeParseJSON(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn("Failed to parse JSON:", error.message);
    return null;
  }
}

function mergeHeaders(originalHeaders = [], overrides = {}) {
  const headers = [...originalHeaders];

  const contentTypeOverride = {
    name: "content-type",
    value: "application/json; charset=utf-8",
  };

  const contentTypeIndex = headers.findIndex(
    (h) => h.name.toLowerCase() === "content-type"
  );
  if (contentTypeIndex !== -1) {
    headers[contentTypeIndex] = contentTypeOverride;
  } else {
    headers.push(contentTypeOverride);
  }

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

function stringToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function createFetchEventListener(tabId, targetUrl, overrideData, mode) {
  return async (source, method, params) => {
    if (source.tabId !== tabId) return;

    if (method !== "Fetch.requestPaused") return;

    const { requestId, request, responseStatusCode, responseHeaders } = params;

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
      const responseBody = await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.getResponseBody",
        { requestId }
      );

      let originalBodyText = "";

      if (responseBody.base64Encoded) {
        try {
          originalBodyText = atob(responseBody.body);
        } catch (error) {
          console.warn(
            "Failed to decode base64 response, continuing without modification",
            error
          );
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
        newBodyText =
          typeof overrideData === "string"
            ? overrideData
            : JSON.stringify(overrideData);
      } else {
        const originalJson = safeParseJSON(originalBodyText);

        if (originalJson === null) {
          console.warn(
            "Original response is not valid JSON, falling back to replace mode"
          );
          newBodyText =
            typeof overrideData === "string"
              ? overrideData
              : JSON.stringify(overrideData);
        } else {
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

          const mergedJson = { ...originalJson, ...overrideJson };
          newBodyText = JSON.stringify(mergedJson);
        }
      }

      if (safeParseJSON(newBodyText) === null) {
        console.warn("Final JSON is invalid, continuing without modification");
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId,
        });
        return;
      }

      const modifiedHeaders = mergeHeaders(responseHeaders);

      await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
        requestId,
        responseCode: responseStatusCode,
        responseHeaders: modifiedHeaders,
        body: stringToBase64(newBodyText),
      });

      console.log("Successfully modified response for:", request.url);
    } catch (error) {
      console.error("Error modifying response:", error);
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

async function enableInterception(tabId, url, overrideData, mode) {
  try {
    await disableInterception(tabId);

    await chrome.debugger.attach({ tabId }, "1.3");
    console.log(`Debugger attached to tab ${tabId}`);

    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [
        {
          urlPattern: url,
          requestStage: "Response",
        },
      ],
    });
    console.log(`Fetch enabled for URL pattern: ${url}`);

    const listener = createFetchEventListener(tabId, url, overrideData, mode);
    chrome.debugger.onEvent.addListener(listener);

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

async function disableInterception(tabId) {
  try {
    const tabState = attachedTabs.get(tabId);

    if (tabState) {
      chrome.debugger.onEvent.removeListener(tabState.listener);
      attachedTabs.delete(tabId);
    }

    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.disable");
    } catch (error) {
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

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  console.log(`Debugger detached from tab ${tabId}, reason: ${reason}`);

  const tabState = attachedTabs.get(tabId);
  if (tabState) {
    chrome.debugger.onEvent.removeListener(tabState.listener);
    attachedTabs.delete(tabId);
  }
});

async function enableRedirection(tabId, sourceUrl, targetUrl, method = "GET") {
  try {
    await disableRedirection(tabId);

    if (!attachedTabs.has(tabId)) {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Fetch.enable");
    }

    redirectRules.set(tabId, { sourceUrl, targetUrl, method });

    const listener = (source, method, params) => {
      if (source.tabId === tabId && method === "Fetch.requestPaused") {
        handleRedirectRequest(tabId, params);
      }
    };

    chrome.debugger.onEvent.addListener(listener);
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [{ urlPattern: "*" }],
    });

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

async function disableRedirection(tabId) {
  try {
    const tabData = attachedTabs.get(tabId);
    if (tabData && tabData.type === "redirect") {
      chrome.debugger.onEvent.removeListener(tabData.listener);

      await chrome.debugger.sendCommand({ tabId }, "Fetch.disable");
      await chrome.debugger.detach({ tabId });

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

async function handleRedirectRequest(tabId, params) {
  const redirectRule = redirectRules.get(tabId);
  if (!redirectRule) {
    chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
      requestId: params.requestId,
    });
    return;
  }

  const { sourceUrl, targetUrl } = redirectRule;
  const requestUrl = params.request.url;

  if (requestUrl.includes(sourceUrl) || requestUrl === sourceUrl) {
    console.log(`Redirecting request: ${requestUrl} → ${targetUrl}`);

    try {
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
      chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
        requestId: params.requestId,
      });
    }
  } else {
    chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
      requestId: params.requestId,
    });
  }
}

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
