import { firebaseConfig, isConfigured } from './firebase-config.js';

const panel = document.getElementById('cloudpanel');
const loginForm = document.getElementById('cloudlogin');
const signed = document.getElementById('cloudsigned');
const message = document.getElementById('cloudmsg');
const title = document.getElementById('cloudtitle');
const hint = document.getElementById('cloudhint');
const importBtn = document.getElementById('importticks');
const logoutBtn = document.getElementById('cloudlogout');
const bridge = window.osceCloudBridge;

if (isConfigured) {
  panel.hidden = false;
  bridge.setStatus('Connecting to shared checklist…');
  // Import version-pinned official Firebase web SDK modules.
  Promise.all([
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
  ]).then(([appApi, authApi, storeApi]) => {
    const app = appApi.initializeApp(firebaseConfig);
    const auth = authApi.getAuth(app);
    const db = storeApi.getFirestore(app);
    let unsubscribe = null;
    let caseRef = null;
    let signedIn = false;
    let ready = false;
    const showError = err => {
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
        return 'Incorrect shared email or password.';
      if (code === 'permission-denied') return 'Access denied. Check your Firestore security rules and shared account UID.';
      return err?.message || 'Connection error. Try again.';
    };
    function enableSignedIn(email) {
      signedIn = true;
      loginForm.hidden = true;
      signed.hidden = false;
      title.textContent = 'Shared checklist';
      hint.textContent = `Signed in as ${email}. Both devices share the same ticked cases.`;
      importBtn.hidden = !bridge.localTicks().length;
    }
    authApi.onAuthStateChanged(auth, user => {
      if (unsubscribe) {unsubscribe();unsubscribe = null;}
      ready = false;
      caseRef = null;
      if (!user) {
        signedIn = false;
        bridge.unsetRemote();
        loginForm.hidden = false;
        signed.hidden = true;
        title.textContent = 'Shared checklist sign in';
        hint.textContent = 'Use the same private account on both devices.';
        message.textContent = '';
        return;
      }
      enableSignedIn(user.email || 'shared account');
      bridge.setStatus('Loading shared progress…');
      caseRef = storeApi.collection(db,'osceShared',user.uid,'cases');
      unsubscribe = storeApi.onSnapshot(caseRef, snapshot => {
        const state = {};
        snapshot.forEach(doc => {if(doc.data()?.done === true)state[doc.id]=true;});
        ready = true;
        bridge.setRemote(state);
        message.textContent = '';
      }, err => {
        ready = false;
        message.textContent = showError(err);
        bridge.unsetRemote();
      });
    }, err => {message.textContent=showError(err);bridge.unsetRemote()});
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();message.textContent = '';
      const button = loginForm.querySelector('button');button.disabled=true;
      try {await authApi.signInWithEmailAndPassword(auth,document.getElementById('cloudemail').value.trim(),document.getElementById('cloudpassword').value)}
      catch(err){message.textContent=showError(err)}
      finally{button.disabled=false;document.getElementById('cloudpassword').value=''}
    });
    logoutBtn.addEventListener('click',()=>authApi.signOut(auth).catch(err=>message.textContent=showError(err)));
    importBtn.addEventListener('click', async () => {
      if (!ready || !caseRef)return;
      const ticks=bridge.localTicks();
      if (!ticks.length) return;
      if(!confirm(`Add ${ticks.length} ticked case(s) from this browser to the shared checklist? Existing shared ticks will be kept.`))return;
      importBtn.disabled = true;message.textContent = 'Importing saved ticks…';
      try {
        // Import only checked cases; never erase cases already completed in the cloud.
        for(let i=0;i<ticks.length;i+=400){
          const batch=storeApi.writeBatch(db);
          ticks.slice(i,i+400).forEach(id => batch.set(storeApi.doc(caseRef,id),{done:true}));
          await batch.commit();
        }
        message.textContent = 'Saved ticks imported.';
        importBtn.hidden = true;
      }catch(err){message.textContent=showError(err)}
      finally{importBtn.disabled=false;}
    });
    window.osceCloud={
      async setCase(id, done){
        if(!signedIn || !ready || !caseRef)throw new Error('Shared checklist unavailable');
        bridge.setStatus('Saving…');
        const ref=storeApi.doc(caseRef,id);
        if(done)await storeApi.setDoc(ref,{done:true});
        else await storeApi.deleteDoc(ref);
        bridge.setStatus('Shared checklist synced');
      },
      async reset(){
        if(!signedIn || !ready || !caseRef)throw new Error('Shared checklist unavailable');
        bridge.setStatus('Clearing shared checklist…');
        // Clear only known case ids; all clients see deletions through onSnapshot.
        const ids=bridge.allIds();
        for(let i=0;i<ids.length;i+=400){
          const batch=storeApi.writeBatch(db);
          ids.slice(i,i+400).forEach(id=>batch.delete(storeApi.doc(caseRef,id)));
          await batch.commit();
        }
        bridge.setStatus('Shared checklist synced');
      }
    };
  }).catch(err=>{message.textContent='Firebase could not load. Check your connection. '+(err?.message||'');bridge.unsetRemote()});
}
