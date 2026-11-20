export type IOSBackendSignIn = {
  /** Prepare an HTTPS browser URL and a proof-bound product session pickup. */
  begin: (signal:AbortSignal) => Promise<{
    url:string;
    /** Resolve only after the product session has been redeemed, validated, and saved. */
    complete:(signal:AbortSignal)=>Promise<void>;
  }>;
};

/** iOS backend handoff for apps without a registered native callback. */
export async function authorizeIOSBackend(
  {begin}:IOSBackendSignIn,
  openBrowser:(url:string)=>Promise<unknown>,
  dismissBrowser:()=>void,
):Promise<void> {
  const controller=new AbortController();
  const {signal}=controller;
  let browser:Promise<unknown>|undefined;
  let open=false;
  try{
    const handoff=await begin(signal);
    const url=new URL(handoff.url);
    if(url.protocol!=='https:'||url.username||url.password||url.hash){
      throw new Error('Use an HTTPS backend browser handoff.');
    }
    browser=openBrowser(url.href).finally(()=>{open=false;});
    open=true;
    await Promise.race([browser,handoff.complete(signal)]);
  }finally{
    controller.abort();
    if(browser&&open){
      dismissBrowser();
      await browser;
    }
  }
}
