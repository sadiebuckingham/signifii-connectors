// Minimal MCP Apps host for local testing (not shipped). Mimics what Claude does:
// list tools, call open_plan, fetch the ui:// resource, render it in a sandboxed iframe, bridge messages.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

window.log = [];
const client = new Client({ name: "test-host", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", location.origin)));
const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === "start_plan");
const uri = tool._meta.ui.resourceUri;
const res = await client.readResource({ uri });
const html = res.contents[0].text;
window.resourceMeta = res.contents[0]._meta;

const iframe = document.createElement("iframe");
iframe.sandbox = "allow-scripts allow-same-origin";
iframe.style.cssText = `width:${window.HOST_WIDTH || 700}px;height:300px;border:1px solid #ccc`;
document.body.appendChild(iframe);
iframe.srcdoc = html;
await new Promise((r) => (iframe.onload = r));

let ctx = { theme: window.HOST_THEME || "light", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"], platform: "web",
  containerDimensions: { maxHeight: 6000, width: window.HOST_WIDTH || 700 }, safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 } };
const bridge = new AppBridge(client, { name: "test-host", version: "0" }, { openLinks: {}, serverTools: {}, logging: {} }, { hostContext: ctx });
bridge.onsizechange = ({ height }) => { if (height) iframe.style.height = height + "px"; window.log.push("size " + height); };
bridge.onrequestdisplaymode = async ({ mode }) => {
  window.log.push("requestDisplayMode " + mode);
  if (mode === "fullscreen") { iframe.style.width = "1100px"; }
  bridge.setHostContext({ ...ctx, displayMode: mode });
  return { mode };
};
bridge.oninitialized = async () => {
  window.log.push("initialized");
  const args = { client: "Bramble Bots" };
  bridge.sendToolInput({ arguments: args });
  const result = await client.callTool({ name: "start_plan", arguments: args });
  bridge.sendToolResult(result);
  window.ready = true;
};
await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
