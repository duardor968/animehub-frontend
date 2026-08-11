import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const addFirst = vi.fn();
  const addSecond = vi.fn();
  const devices = [
    { id: "first", name: "Desktop", linkGrabberAddLinks: addFirst },
    { id: "second", name: "Server", linkGrabberAddLinks: addSecond },
  ];
  const client = {
    listDevices: vi.fn().mockResolvedValue(devices),
    disconnect: vi.fn(),
  };
  return {
    addFirst,
    addSecond,
    client,
    connect: vi.fn().mockResolvedValue(client),
  };
});

vi.mock("jdownloader-connect", () => ({ default: mocks.connect }));

import {
  connectMyJd,
  disconnectMyJd,
  sendToClickNLoad,
  sendToMyJd,
} from "./download-client";

describe("download clients", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await disconnectMyJd();
    sessionStorage.clear();
  });

  it("keeps the MyJDownloader session in memory and addresses the chosen device", async () => {
    const devices = await connectMyJd("user@example.com", "password");

    expect(devices).toHaveLength(2);
    expect(sessionStorage.getItem("animehub.myjd.session")).toBe("active");
    await sendToMyJd("second", "Fixture Anime", ["https://example.com/one"]);
    expect(mocks.addSecond).toHaveBeenCalledWith({
      links: "https://example.com/one",
      packageName: "Fixture Anime",
      autostart: false,
    });
    expect(mocks.addFirst).not.toHaveBeenCalled();
  });

  it("submits Click'n'Load directly to the loopback service", () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);

    sendToClickNLoad("Fixture Anime", ["https://example.com/one"]);

    const form = document.querySelector(
      'form[action="http://127.0.0.1:9666/flash/add"]',
    );
    expect(submit).toHaveBeenCalledOnce();
    expect(form).not.toBeNull();
    expect(new FormData(form as HTMLFormElement).get("urls")).toBe(
      "https://example.com/one",
    );
  });
});
