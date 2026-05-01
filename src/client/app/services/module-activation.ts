export interface AppTabActivatedDetail {
  target?: string;
}

export function dispatchAppTabActivated(target: string) {
  document.dispatchEvent(new CustomEvent<AppTabActivatedDetail>("app:tab-activated", {
    detail: { target }
  }));
}

export function onAppTabActivated(target: string, handler: () => void) {
  const listener = (event: Event) => {
    if ((event as CustomEvent<AppTabActivatedDetail>).detail?.target !== target) return;
    handler();
  };

  document.addEventListener("app:tab-activated", listener);
  return () => document.removeEventListener("app:tab-activated", listener);
}
