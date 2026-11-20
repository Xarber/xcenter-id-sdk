import { useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';

export type AccountEntryProps = {
  onSignIn?: () => void;
  onCreateAccount?: () => void;
  onUsernameSubmit?: (username:string)=>Promise<{method:'email';ticket:string}|{method:'passkey'}|undefined>;
  onCodeSubmit?: (ticket:string,code:string)=>Promise<void>;
  pending?: boolean;
  pendingAction?: 'passkey'|'signup';
  transparent?:boolean;
  error?: string;
  children?: ReactNode;
};

export function AccountEntry({ onSignIn, onCreateAccount,onUsernameSubmit,onCodeSubmit,pending = false,pendingAction,error,children,transparent=true }: AccountEntryProps) {
  const dark = useColorScheme() === 'dark';
  const ink = dark ? '#f4f7ff' : '#142438';
  const color = dark ? '#a8c7ff' : '#174eaa';
  const panel = dark ? '#203a61' : '#e4edff';
  const action = dark ? '#375fce' : '#214fbe';
  const muted = dark ? '#b1c1dc' : '#526078';

  const [username,setUsername]=useState('');
  const [ticket,setTicket]=useState('');
  const [code,setCode]=useState('');
  const [needsPasskey,setNeedsPasskey]=useState(false);
  const [active,setActive]=useState<'username'|'code'|null>(null);
  const [failure,setFailure]=useState('');
  const busy=pending||active!==null;
  async function submit(){
    setFailure('');
    setActive(ticket?'code':'username');
    try {
      if(ticket)await onCodeSubmit?.(ticket,code);
      else {
        const result=await onUsernameSubmit?.(username);
        if(result?.method==='email'){setTicket(result.ticket);setCode('');}
        if(result?.method==='passkey')setNeedsPasskey(true);
      }
    }catch(error){setFailure(error instanceof Error?error.message:'Could not sign in.');}
    finally{setActive(null);}
  }
  function button(label:string,press:()=>void,primary=false,disabled=busy){
    return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={press}
      style={({pressed})=>[styles.button,{backgroundColor:primary?action:panel,opacity:pressed||disabled?.65:1}]}>
      <Text style={{color:primary?'#fff':color,fontWeight:'700'}}>{label}</Text>
    </Pressable>;
  }

  return (
    <View style={[styles.card,!transparent&&{backgroundColor:dark?'#192433':'#fff'}]}>
      <View style={styles.brandRow}>
        <Image source={require('./assets/xcenter-id-mark.png')} style={styles.mark} accessibilityIgnoresInvertColors/>
        <Text style={[styles.brand,{color}]}>X-Center ID</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.title,{color:ink}]}>Sign in with X-Center ID</Text>
      {onUsernameSubmit&&onCodeSubmit&&<>
        <Text style={{color:muted}}>{ticket?'Enter the code sent to your verified email.':'Enter your X-Center username.'}</Text>
        {ticket?<TextInput accessibilityLabel="Email sign-in code" value={code} onChangeText={value=>setCode(value.replace(/\D/g,'').slice(0,6))}
          {...(Platform.OS==='ios'?{textContentType:'oneTimeCode' as const}:{autoComplete:'one-time-code' as const})}
          keyboardType="number-pad" autoFocus editable={!busy} style={[styles.input,{color:ink,borderColor:muted}]}/>
          :<TextInput accessibilityLabel="X-Center username" value={username} onChangeText={value=>{setUsername(value);setNeedsPasskey(false);}}
            autoComplete="username" autoCapitalize="none" autoCorrect={false} maxLength={24} editable={!busy} style={[styles.input,{color:ink,borderColor:muted}]}/>}
        {needsPasskey?<Text style={{color:muted}}>This account uses a passkey.</Text>:button(active==='code'?'Verifying…':active==='username'?'Checking username…':ticket?'Verify code':'Continue',
          ()=>void submit(),true,busy||(ticket?!/^\d{6}$/.test(code):!username.trim()))}
        {ticket&&button('Use another username',()=>{setTicket('');setCode('');})}
      </>}
      {error||failure?<Text accessibilityRole="alert" style={{color:ink}}>{failure||error}</Text>:null}
      <View style={styles.actions}>
        {onSignIn&&button(pending&&pendingAction!=='signup'?'Waiting for your passkey…':'Use a passkey',onSignIn,needsPasskey||!onUsernameSubmit)}
        {onCreateAccount&&button(pending&&pendingAction==='signup'?'Opening account setup…':'Create an account',onCreateAccount)}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, borderRadius: 20, padding: 18 },
  brandRow:{flexDirection:'row',alignItems:'center',gap:9},
  mark:{width:33,height:28,resizeMode:'contain'},
  input:{minHeight:48,borderWidth:1,borderRadius:11,paddingHorizontal:12,fontSize:16},
  brand: { fontSize: 14, fontWeight: '800', letterSpacing: .2 },
  title: { fontSize: 24, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { minHeight: 48, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 14 },
});

export { AccountOverview, type AccountOverviewProps, type OverviewProfile, type OverviewSyncOption } from './account-overview';
