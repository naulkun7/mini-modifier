# README.MD IS CREATED BY AI (THANK YOU TO GPT5)

# Mini Modifier - API Request & Response Editor

A Chrome extension that provides comprehensive API manipulation capabilities including response modification and request redirection using the Chrome DevTools Protocol (CDP). Perfect for testing, debugging, and development workflows.

## What it does

- **Modifies API responses**: Replace or merge JSON response data before the page receives it
- **Redirects API requests**: Intercept requests and redirect them to different endpoints
- **Tabbed interface**: Organized UI for different modification types
- **Works locally**: 100% local operation - no external servers or data transmission
- **Per-tab control**: Enable/disable features independently for each browser tab
- **Real-time modification**: Changes take effect immediately when pages make API calls

## Installation

1. Download or clone this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `mini-modifier` folder
5. The extension should now appear in your extensions list

## How to use

The extension features a tabbed interface with two main functionalities:

### Tab 1: Modify Response

Perfect for testing API changes, simulating errors, or adding new features to existing responses.

1. **Navigate to your target website** - Open the page that makes the API call you want to intercept
2. **Open the extension popup** - Click the Mini Modifier icon in your browser toolbar
3. **Select "Modify Response" tab** (default tab)
4. **Enter the exact Request URL** (e.g., `https://api.example.com/data`)
5. **Enter the JSON response** you want the page to receive
6. **Choose your mode**:
   - **Merge**: Combines your JSON with the original response (your properties override existing ones)
   - **Replace**: Completely replaces the original response with your JSON
7. **Click Enable** - The extension will attach to the current tab and start intercepting
8. **Reload the page** - Refresh the website to see your modified responses
9. **Click Disable** - Stop intercepting and return to normal behavior

### Tab 2: Redirect Request

Perfect for testing against different environments, load balancing, or API version switching.

1. **Navigate to your target website**
2. **Open the extension popup** and select **"Redirect Request" tab**
3. **Set Source URL** (to intercept) by typing the full endpoint
4. **Set Target URL** (redirect destination) with the URL you want to serve instead
5. **Choose Request Method**: GET, POST, PUT, DELETE, or PATCH
6. **Click Enable** - The extension will start redirecting matching requests
7. **Make requests** - Any matching requests will be redirected to your target URL
8. **Click Disable** - Stop redirection and return to normal behavior

### Example Scenarios

#### Testing API Changes (Modify Response)

```javascript
// Original API response:
{"user": {"name": "John", "role": "user"}}

// Your override (Merge mode):
{"user": {"role": "admin", "premium": true}}

// Final response the page receives:
{"user": {"name": "John", "role": "admin", "premium": true}}
```

#### Simulating Error Conditions (Modify Response)

```javascript
// Replace mode with error response:
{"error": "Service temporarily unavailable", "code": 503}
```

#### Environment Switching (Redirect Request)

```
Source URL: https://api.production.com/users
Target URL:  https://api.staging.com/users
Method: GET

Result: All requests to production API are redirected to staging
```

#### API Version Testing (Redirect Request)

```
Source URL: https://api.example.com/v1/data
Target URL:  https://api.example.com/v2/data
Method: GET

Result: Test v2 API responses without changing application code
```

#### Adding New Features (Modify Response)

```javascript
// Original response:
{"products": [{"id": 1, "name": "Widget"}]}

// Your override (Merge mode):
{"beta_features": {"new_ui": true}, "user_preferences": {"theme": "dark"}}
```

## Features

- ✅ **Tabbed interface** - Organized UI for response modification and request redirection
- ✅ **Response modification** - JSON merge/replace modes with real-time validation
- ✅ **Request redirection** - Redirect API calls to different endpoints
- ✅ **Concurrent modes** - Run response modification and redirection simultaneously per tab
- ✅ **Direct input workflow** - Type endpoints and payloads inline without managing preset files
- ✅ **Persistent settings** - All inputs automatically saved and restored per browser profile
- ✅ **Per-tab operation** - Each tab can have different settings
- ✅ **Exact URL matching** - Precise control over which requests to intercept
- ✅ **Status indicators** - Clear feedback about active features
- ✅ **Error handling** - Graceful fallbacks when operations fail

## Notes & Limitations

### Current Limitations (v1.0)

- **Uncompressed responses only**: Response modification works with uncompressed JSON responses (no gzip/deflate/brotli support yet)
- **Exact URL matching**: URLs must match exactly - query parameters, protocols, etc. must be identical
- **JSON responses only**: Response modification currently designed for JSON APIs (not HTML, XML, or other formats)
- **Basic redirect**: Request redirection uses simple URL matching and HTTP 302 redirects

### Browser Behavior

- **Debugger permission warning**: Chrome will show a yellow banner warning about debugger access (this is expected and required)
- **Per-tab activation**: You must enable features separately for each tab where you want them active
- **Page reload recommended**: Changes typically require a page reload to take effect
- **Tab persistence**: Settings are saved per tab and restored when reopening the popup

### Troubleshooting

#### Response modification not working

1. **Verify the exact URL**: Open DevTools (F12) → Network tab → reload the page → find your API call and copy the exact URL
2. **Check response format**: The original response must be valid JSON for modification to work
3. **Try hard refresh**: Use Ctrl+Shift+R (Cmd+Shift+R on Mac) to bypass cache
4. **Verify JSON syntax**: Use a JSON validator to check your override response

#### Request redirection not working

1. **Check URL matching**: Source URL must match exactly with the intercepted request
2. **Verify target URL**: Ensure the target URL is accessible and responds correctly
3. **Network tab inspection**: Use DevTools to see if redirects are happening
4. **CORS considerations**: Target URLs must have appropriate CORS headers

#### Extension seems to stop working

1. **Check the debugger connection**: If you see "DevTools is being controlled by automated test software" it means the extension is attached
2. **Re-enable if needed**: Click Disable then Enable again if the connection seems lost
3. **Switch tabs**: Make sure you're on the correct tab - settings are per-tab
4. **Restart if necessary**: Close and reopen the tab, or restart Chrome if issues persist

## Security & Privacy

- **Local operation only**: All processing happens locally in your browser - no data is sent to external servers
- **Debugger permission**: Uses Chrome's debugger API to intercept network requests (required for this functionality)
- **Local storage only**: Settings are stored locally using Chrome's storage API
- **No tracking**: The extension doesn't collect, transmit, or store any personal data

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension format)
- **Required Permissions**: `debugger`, `activeTab`, `storage`, `scripting`
- **Chrome DevTools Protocol**: Uses the Fetch domain for request interception
- **Background Service Worker**: Handles network interception logic
- **Storage**: Uses `chrome.storage.local` for persistence

## Advanced Usage Tips

### Finding the Right URL

1. Open DevTools (F12) before loading the page
2. Go to Network tab and filter by "Fetch/XHR"
3. Reload the page and look for your API calls
4. Right-click the request → "Copy" → "Copy URL"

### Response Modification Strategies

- Use **merge mode** to gradually override specific properties
- Test error responses by using **replace mode** with error JSON
- Combine with DevTools to see exactly what the page receives
- Create presets for common test scenarios

### Request Redirection Use Cases

- **Environment switching**: Redirect production APIs to staging/development
- **API versioning**: Test new API versions without code changes
- **Load balancing**: Distribute requests across multiple endpoints
- **Local development**: Redirect to local development servers

### Working with Authentication

- The extension preserves original headers (including auth tokens)
- Response modification only changes the response body - request headers remain unchanged
- Request redirection maintains original request headers and method
- CORS policies still apply normally

## Roadmap & Future Features

### Planned Enhancements

- **Compression support**: Handle gzip/deflate/brotli compressed responses
- **Advanced URL patterns**: Support wildcards and regex patterns for URLs
- **Request body modification**: Modify request payloads and headers (not just responses)
- **Response delay simulation**: Add artificial delays for testing
- **Conditional redirects**: Redirect based on request headers, methods, or content
- **Find & Replace mode**: Text manipulation before JSON parsing
- **Logging panel**: View history of intercepted requests and modifications
- **Export/Import**: Save and share configuration presets
- **Bulk operations**: Apply modifications to multiple URLs simultaneously

### Contributing

This is a development tool designed for extensibility. Feel free to:

- Fork and extend for your specific needs
- Add new preset configurations
- Contribute bug fixes or feature enhancements
- Suggest new use cases or improvements

The code is structured for readability and modification, with clear separation between UI, background logic, and configuration.

## License

MIT License - feel free to use, modify, and distribute as needed.
