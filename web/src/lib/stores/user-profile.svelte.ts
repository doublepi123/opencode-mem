import { toast } from "$lib/toast/toast.svelte";
import { fetchAPI, toastApiResult } from "$lib/api";
import { t } from "$lib/i18n";
import type { UserProfile } from "$lib/types";

export function createUserProfile() {
  let userProfile = $state<UserProfile | null>(null);
  let loadingProfile = $state(false);
  let aiCleanupOpen = $state(false);

  async function loadUserProfile() {
    loadingProfile = true;
    const result = await fetchAPI<UserProfile>("/api/user-profile");
    loadingProfile = false;
    if (result.success && result.data) {
      userProfile = result.data;
    } else {
      await toastApiResult(result, { failKey: "toast-update-failed" });
    }
  }

  async function refreshProfile() {
    toast.info(t("loading-profile"));
    const result = await fetchAPI("/api/user-profile/refresh", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await toastApiResult(result, {
      successKey: "toast-update-success",
      failKey: "toast-update-failed",
      onSuccess: () => loadUserProfile(),
    });
  }

  return {
    get userProfile() {
      return userProfile;
    },
    get loadingProfile() {
      return loadingProfile;
    },
    get aiCleanupOpen() {
      return aiCleanupOpen;
    },
    set aiCleanupOpen(v: boolean) {
      aiCleanupOpen = v;
    },
    loadUserProfile,
    refreshProfile,
  };
}

export type UserProfileStore = ReturnType<typeof createUserProfile>;
