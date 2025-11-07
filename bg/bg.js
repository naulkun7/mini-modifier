const tabSessions = new Map();
const redirectRules = new Map();

function getOrCreateSession(tabId) {
  let session = tabSessions.get(tabId);
  if (!session) {
    session = {
      attached: false,
      modify: null,
      redirect: null,
    };
    tabSessions.set(tabId, session);
  }
  return session;
}

async function ensureDebuggerSession(tabId) {
  const session = getOrCreateSession(tabId);
  if (session.attached) {
    return session;
  }

  await chrome.debugger.attach({ tabId }, "1.3");
  session.attached = true;
  console.log(`Debugger attached to tab ${tabId}`);
  return session;
}

function removeModifyListener(tabId) {
  const session = tabSessions.get(tabId);
  if (session?.modify?.listener) {
    chrome.debugger.onEvent.removeListener(session.modify.listener);
    session.modify = null;
  }
}

function removeRedirectListener(tabId) {
  const session = tabSessions.get(tabId);
  if (session?.redirect?.listener) {
    chrome.debugger.onEvent.removeListener(session.redirect.listener);
    session.redirect = null;
  }
  redirectRules.delete(tabId);
}

async function detachDebuggerIfIdle(tabId) {
  const session = tabSessions.get(tabId);
  if (!session) return;
  if (session.modify || session.redirect) return;

  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.disable");
  } catch (error) {
    console.log(`Fetch.disable failed for tab ${tabId}: ${error.message}`);
  }

  try {
    await chrome.debugger.detach({ tabId });
  } catch (error) {
    // ignore if already detached
  }

  tabSessions.delete(tabId);
  console.log(`Debugger detached from tab ${tabId}`);
}

async function updateFetchPatterns(tabId) {
  const session = tabSessions.get(tabId);
  if (!session?.attached) return;

  const patterns = [];
  if (session.redirect?.sourceUrl) {
    const requestPatterns = new Set();
    const addRequestPattern = (pattern) => {
      if (!pattern || requestPatterns.has(pattern)) return;
      requestPatterns.add(pattern);
      patterns.push({ urlPattern: pattern, requestStage: "Request" });
    };

    const sourcePattern = session.redirect.sourceUrl.trim();
    addRequestPattern(sourcePattern);

    if (sourcePattern && !sourcePattern.includes("*")) {
      const wildcardPattern = sourcePattern.endsWith("*")
        ? sourcePattern
        : `${sourcePattern}*`;
      addRequestPattern(wildcardPattern);
    }
  }
  if (session.modify?.targetUrl) {
    patterns.push({
      urlPattern: session.modify.targetUrl,
      requestStage: "Response",
    });
  }

  if (patterns.length === 0) {
    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.disable");
    } catch (error) {
      console.log(`Fetch.disable failed for tab ${tabId}: ${error.message}`);
    }
  } else {
    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
        patterns,
      });
    } catch (error) {
      console.error("Failed to update Fetch patterns:", error);
    }
  }
}

async function forceDetach(tabId) {
  try {
    await disableInterception(tabId);
    await disableRedirection(tabId);
    console.log(`Force detached debugger for tab ${tabId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to force detach debugger:", error);
    return { success: false, error: error.message };
  }
}

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

function resolveResponseCode(originalCode, overrideCode) {
  if (
    Number.isInteger(overrideCode) &&
    overrideCode >= 100 &&
    overrideCode <= 599
  ) {
    return overrideCode;
  }

  return originalCode;
}

function createFetchEventListener(
  tabId,
  targetUrl,
  overrideData,
  mode,
  statusCodeOverride
) {
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

      const responseCode = resolveResponseCode(
        responseStatusCode,
        statusCodeOverride
      );

      await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
        requestId,
        responseCode,
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

async function enableInterception(
  tabId,
  url,
  overrideData,
  mode,
  statusCodeOverride
) {
  try {
    const numericStatusCode =
      typeof statusCodeOverride === "number"
        ? statusCodeOverride
        : Number.parseInt(statusCodeOverride, 10);
    const sanitizedStatusCode = Number.isInteger(numericStatusCode)
      ? numericStatusCode
      : null;

    await ensureDebuggerSession(tabId);
    removeModifyListener(tabId);

    const listener = createFetchEventListener(
      tabId,
      url,
      overrideData,
      mode,
      sanitizedStatusCode
    );
    chrome.debugger.onEvent.addListener(listener);

    const session = getOrCreateSession(tabId);
    session.modify = {
      listener,
      targetUrl: url,
      statusCodeOverride: sanitizedStatusCode,
    };
    await updateFetchPatterns(tabId);

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
    removeModifyListener(tabId);
    await updateFetchPatterns(tabId);
    await detachDebuggerIfIdle(tabId);
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

  const session = tabSessions.get(tabId);
  if (session?.modify?.listener) {
    chrome.debugger.onEvent.removeListener(session.modify.listener);
  }
  if (session?.redirect?.listener) {
    chrome.debugger.onEvent.removeListener(session.redirect.listener);
  }
  tabSessions.delete(tabId);
  redirectRules.delete(tabId);
});

async function enableRedirection(tabId, sourceUrl, targetUrl, method = "GET") {
  try {
    const normalizedSource = (sourceUrl || "").trim();
    const normalizedTarget = (targetUrl || "").trim();
    await ensureDebuggerSession(tabId);
    removeRedirectListener(tabId);

    redirectRules.set(tabId, {
      sourceUrl: normalizedSource,
      targetUrl: normalizedTarget,
      method: method ? method.toUpperCase() : null,
    });

    const listener = (source, eventMethod, params) => {
      if (source.tabId === tabId && eventMethod === "Fetch.requestPaused") {
        handleRedirectRequest(tabId, params);
      }
    };

    chrome.debugger.onEvent.addListener(listener);

    const session = getOrCreateSession(tabId);
    session.redirect = {
      listener,
      sourceUrl: normalizedSource,
      targetUrl: normalizedTarget,
    };
    await updateFetchPatterns(tabId);

    console.log(
      `Redirect enabled for tab ${tabId}: ${normalizedSource} → ${normalizedTarget}`
    );
    return { success: true };
  } catch (error) {
    console.error("Failed to enable redirection:", error);
    return { success: false, error: error.message };
  }
}

async function disableRedirection(tabId) {
  try {
    removeRedirectListener(tabId);
    await updateFetchPatterns(tabId);
    await detachDebuggerIfIdle(tabId);
    console.log(`Redirect disabled for tab ${tabId}`);
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

  const { sourceUrl, targetUrl, method } = redirectRule;
  const requestUrl = params.request.url;
  const requestMethod = params.request.method?.toUpperCase();
  const methodMatches = method ? requestMethod === method : true;

  const normalizedSource = sourceUrl || "";
  const urlsMatch =
    requestUrl === normalizedSource ||
    requestUrl.startsWith(`${normalizedSource}?`) ||
    requestUrl.startsWith(`${normalizedSource}/`) ||
    requestUrl.startsWith(normalizedSource) ||
    requestUrl.includes(normalizedSource);

  if (methodMatches && normalizedSource && urlsMatch) {
    console.log(`Redirecting request: ${requestUrl} → ${targetUrl}`);

    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
        requestId: params.requestId,
        url: targetUrl,
      });
    } catch (error) {
      console.error("Failed to continue redirected request:", error);
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
    statusCodeOverride,
  } = message;

  if (action === "enable") {
    enableInterception(
      tabId,
      url,
      overrideData,
      mode,
      statusCodeOverride
    ).then((result) => sendResponse(result));
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
  } else if (action === "forceDetach") {
    forceDetach(tabId).then((result) => sendResponse(result));
    return true;
  } else if (action === "getStatus") {
    const session = tabSessions.get(tabId);
    const modifyActive = Boolean(session?.modify);
    const redirectActive = Boolean(session?.redirect);
    const targetUrl = session?.modify?.targetUrl || null;
    sendResponse({
      isAttached: modifyActive,
      modifyActive,
      redirectActive,
      targetUrl,
    });
  } else {
    sendResponse({ success: false, error: "Unknown action" });
  }
});

// TODO: Add compression support (gzip/deflate/br)
// TODO: Add find & replace mode for text manipulation
// TODO: Add logging panel functionality
// TODO: Add "continue without modification on error" toggle
