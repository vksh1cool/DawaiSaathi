import { afterEach, describe, expect, it, vi } from "vitest";

function stubNotificationEnv(
  opts: {
    supported?: boolean;
    permission?: NotificationPermission;
  } = {},
) {
  const { supported = true, permission = "default" } = opts;
  const store: Record<string, string> = {};
  const instances: { title: string; options?: NotificationOptions }[] = [];
  const requestPermissionMock = vi.fn(async () => permission);
  const vibrateMock = vi.fn();

  const windowObj: Record<string, unknown> = {
    localStorage: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    },
  };

  if (supported) {
    class MockNotification {
      static permission = permission;
      static requestPermission = requestPermissionMock;
      constructor(title: string, options?: NotificationOptions) {
        instances.push({ title, options });
      }
    }
    windowObj.Notification = MockNotification;
    vi.stubGlobal("Notification", MockNotification);
  }

  vi.stubGlobal("window", windowObj);
  vi.stubGlobal("navigator", { vibrate: vibrateMock });

  return { store, instances, requestPermissionMock, vibrateMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("alarms (Tier 1 foreground reminders)", () => {
  it("reports unsupported and denies permission when the Notification API is unavailable", async () => {
    stubNotificationEnv({ supported: false });
    const { alarmsSupported, getNotificationPermission, requestRemindersPermission } = await import(
      "@/lib/alarms"
    );
    expect(alarmsSupported()).toBe(false);
    expect(getNotificationPermission()).toBe("unsupported");
    await expect(requestRemindersPermission()).resolves.toBe("denied");
  });

  it("round-trips the reminders opt-in preference through localStorage", async () => {
    stubNotificationEnv();
    const { getRemindersEnabled, setRemindersEnabled } = await import("@/lib/alarms");
    expect(getRemindersEnabled()).toBe(false);
    setRemindersEnabled(true);
    expect(getRemindersEnabled()).toBe(true);
    setRemindersEnabled(false);
    expect(getRemindersEnabled()).toBe(false);
  });

  it("does not fire when browser permission has not been granted, even if opted in", async () => {
    const env = stubNotificationEnv({ permission: "default" });
    const { setRemindersEnabled, fireDoseAlarm } = await import("@/lib/alarms");
    setRemindersEnabled(true);
    fireDoseAlarm("20:00", "Dose due now", "It's time");
    expect(env.instances).toHaveLength(0);
    expect(env.vibrateMock).not.toHaveBeenCalled();
  });

  it("does not fire when the user has opted out even though permission is granted", async () => {
    const env = stubNotificationEnv({ permission: "granted" });
    const { fireDoseAlarm } = await import("@/lib/alarms");
    fireDoseAlarm("20:00", "Dose due now", "It's time");
    expect(env.instances).toHaveLength(0);
    expect(env.vibrateMock).not.toHaveBeenCalled();
  });

  it("fires a notification and vibrates once permission is granted and the user has opted in", async () => {
    const env = stubNotificationEnv({ permission: "granted" });
    const { setRemindersEnabled, fireDoseAlarm } = await import("@/lib/alarms");
    setRemindersEnabled(true);
    fireDoseAlarm("20:00", "Dose due now", "It's time for Kamla Devi's medicine.");
    expect(env.instances).toEqual([
      {
        title: "Dose due now",
        options: { body: "It's time for Kamla Devi's medicine.", tag: "dawaisaathi-dose-20:00" },
      },
    ]);
    expect(env.vibrateMock).toHaveBeenCalledWith([200, 100, 200]);
  });

  it("delegates permission requests to the Notification API when supported", async () => {
    const env = stubNotificationEnv({ permission: "granted" });
    const { requestRemindersPermission } = await import("@/lib/alarms");
    await expect(requestRemindersPermission()).resolves.toBe("granted");
    expect(env.requestPermissionMock).toHaveBeenCalledTimes(1);
  });
});
