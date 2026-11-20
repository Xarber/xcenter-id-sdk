import { useRef, useState, type ReactNode } from 'react';
import { Image, Linking, Platform, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, useColorScheme, type ImageSourcePropType } from 'react-native';
import {dismissAuthSession,openAuthSessionAsync} from 'expo-web-browser';
import {authorizeNative} from './authorize-native';
import {authorizeIOSBackend,type IOSBackendSignIn} from './backend-signin';
import {webSignInUrl} from './managed-signin-urls';
import type {RegisteredAppSignInProps} from './registered-signin';

export type OverviewProfile = {
  name: string;
  username: string;
  email?: string;
  photo?: ImageSourcePropType;
  verified?: boolean;
  administrator?: boolean;
};

export type OverviewSyncOption = {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
};

export type AccountOverviewProps = {
  profile: OverviewProfile | null;
  clientId?: string;
  signIn?: RegisteredAppSignInProps;
  iosBackendSignIn?: IOSBackendSignIn;
  webSignIn?: {startPath:string};
  onSignIn?: () => void | Promise<void>;
  onSignOut?: () => void | Promise<void>;
  syncOptions?: readonly OverviewSyncOption[];
  settings?: ReactNode;
  onOpenSettings?: () => void;
  onManageAccount?: () => void | Promise<void>;
};

const palettes = {
  light:{hero:'#e7efff', panel:'#ffffff', ink:'#142438', muted:'#526078', accent:'#174eaa', line:'#dbe3ef'},
  dark:{hero:'#243657', panel:'#192433', ink:'#f4f7ff', muted:'#bbc9df', accent:'#b9d0ff', line:'#435676'},
};

/** Account entry and details. The host validates and stores its own session. */
export function AccountOverview({profile,clientId,signIn,iosBackendSignIn,webSignIn,onSignIn,onSignOut,syncOptions=[],settings,onOpenSettings,onManageAccount}:AccountOverviewProps) {
  const palette=useColorScheme()==='dark'?palettes.dark:palettes.light;
  const [pictureFailed,setPictureFailed]=useState<ImageSourcePropType>();
  const [error,setError]=useState('');
  const [details,setDetails]=useState(false);
  const [pending,setPending]=useState(false);
  const signingIn=useRef(false);
  const backend=Platform.OS==='ios'?iosBackendSignIn:undefined;
  const website=Platform.OS==='web'?webSignIn:undefined;
  const native=Platform.OS==='ios'||Platform.OS==='android'?signIn:undefined;

  async function start(){
    if(signingIn.current)return;
    signingIn.current=true;
    setPending(true);setError('');
    try{
      if(onSignIn)await onSignIn();
      else if(website)window.location.assign(webSignInUrl(website.startPath,window.location.origin));
      else if(backend)await authorizeIOSBackend(backend,url=>openAuthSessionAsync(url,null),dismissAuthSession);
      else if(native){
        const result=await authorizeNative({...native,issuer:'https://id.xcenter.it'});
        if(result)await native.onAuthorized(result);
      }
    }catch(failure){setError(failure instanceof Error?failure.message:'Could not sign in.');}
    finally{signingIn.current=false;setPending(false);}
  }
  async function signOut(){
    setPending(true);setError('');
    try{await onSignOut?.();setDetails(false);}
    catch{setError('Could not sign out. Try again.');}
    finally{setPending(false);}
  }
  async function open(url:string){
    try{await Linking.openURL(url);}
    catch{setError('Could not open X-Center ID. Try again.');}
  }

  async function manageAccount(){
    setError('');
    try{
      if(onManageAccount)await onManageAccount();
      else setDetails(true);
    }catch{setError('Could not open X-Center ID. Try again.');}
  }

  function action(label:string,onPress:()=>void,destructive=false){
    return <Pressable accessibilityRole="button" disabled={pending} onPress={onPress}
      style={({pressed})=>[styles.action,{backgroundColor:palette.panel,borderColor:palette.line,opacity:pressed?.65:1}]}>
      <Text style={[styles.actionLabel,{color:destructive?(palette===palettes.dark?'#ffadad':'#a42635'):palette.accent}]}>{label}</Text>
    </Pressable>;
  }

  const badge=(label:string)=><Text style={[styles.badge,{color:palette.accent,backgroundColor:palette.panel}]}>{label}</Text>;
  const brand=<View style={styles.brand}>
    <Image source={require('./assets/xcenter-id-mark.png')} accessible={false} style={styles.mark}/>
    <Text style={[styles.actionLabel,{color:palette.accent}]}>X-Center ID</Text>
  </View>;
  if(!profile)return <View style={[styles.hero,{backgroundColor:palette.hero}]}>
    {brand}
    <Text accessibilityRole="header" style={[styles.name,{color:palette.ink}]}>Sign in or create an account</Text>
    {(onSignIn||native||backend||website)&&action(pending?'Opening sign-in…':'Continue with X-Center ID',()=>void start())}
    {!!error&&<Text accessibilityRole="alert" style={{color:palette.ink}}>{error}</Text>}
  </View>;
  const showPhoto=profile.photo&&profile.photo!==pictureFailed;
  const identity=<>
      <View style={styles.identity}>
        {showPhoto?<Image source={profile.photo} accessibilityLabel="Profile photo" style={styles.avatar} onError={()=>setPictureFailed(profile.photo)}/>:
          <View accessible={false} style={[styles.avatar,styles.avatarFallback,{backgroundColor:palette.panel}]}>
            <Text style={[styles.initial,{color:palette.accent}]}>{Array.from(profile.name.trim())[0]?.toLocaleUpperCase()??'?'}</Text>
          </View>}
        <View style={styles.identityText}>
          <Text accessibilityRole="header" style={[styles.name,{color:palette.ink}]}>{profile.name}</Text>
          <Text style={{color:palette.muted}}>@{profile.username}</Text>
          {!!profile.email&&<Text style={{color:palette.muted}}>{profile.email}</Text>}
        </View>
      </View>
      {(profile.verified||profile.administrator)&&<View style={styles.badges}>
        {profile.verified&&badge('Verified profile')}
        {profile.administrator&&badge('Administrator')}
      </View>}
  </>;
  const app=clientId??signIn?.clientId;
  return <View style={styles.overview}>
    <View style={[styles.hero,{backgroundColor:palette.hero}]}>
      {brand}{identity}
      {action('Manage account & data →',()=>void manageAccount())}
      {!details&&!!error&&<Text accessibilityRole="alert" style={{color:palette.ink}}>{error}</Text>}
    </View>
    <Modal visible={details} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setDetails(false)}>
      <ScrollView style={{backgroundColor:palette.panel}} contentContainerStyle={styles.sheet}>
        {action('Back to settings',()=>setDetails(false))}
        <View style={[styles.hero,{backgroundColor:palette.hero}]}>
          {brand}{identity}
          <View style={styles.badges}>
            {action('Open dashboard',()=>void open('https://id.xcenter.it/dashboard'))}
            {app&&action('Manage app',()=>void open('https://id.xcenter.it/permissions/'+encodeURIComponent(app)))}
            {onSignOut&&action('Sign out',()=>void signOut(),true)}
          </View>
          {!!error&&<Text accessibilityRole="alert" style={{color:palette.ink}}>{error}</Text>}
        </View>
    {(syncOptions.length>0||settings||onOpenSettings)&&<View style={styles.settings}>
      <Text accessibilityRole="header" style={[styles.heading,{color:palette.ink}]}>App settings</Text>
      {syncOptions.map(option=><View key={option.id} style={[styles.option,{backgroundColor:palette.panel,borderColor:palette.line}]}>
        <View style={styles.identityText}>
          <Text style={[styles.actionLabel,{color:palette.ink}]}>{option.label}</Text>
          {!!option.description&&<Text style={{color:palette.muted}}>{option.description}</Text>}
        </View>
        <Switch accessibilityLabel={option.label} accessibilityHint={option.description} value={option.enabled}
          disabled={option.disabled} onValueChange={option.onChange}/>
      </View>)}
      {settings}
      {onOpenSettings&&action('Open app settings',onOpenSettings)}
    </View>}
      </ScrollView>
    </Modal>
  </View>;
}

const styles=StyleSheet.create({
  overview:{gap:20},
  sheet:{padding:20,gap:16},
  hero:{borderRadius:22,padding:18,gap:13},
  brand:{flexDirection:'row',alignItems:'center',gap:8},
  mark:{width:28,height:24,resizeMode:'contain'},
  identity:{flexDirection:'row',alignItems:'center',gap:13},
  identityText:{flex:1,minWidth:0,gap:3},
  avatar:{width:58,height:58,borderRadius:29},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  initial:{fontSize:21,fontWeight:'700'},
  name:{fontSize:23,fontWeight:'800'},
  heading:{fontSize:18,fontWeight:'700'},
  badges:{flexDirection:'row',gap:6,flexWrap:'wrap'},
  badge:{borderRadius:20,overflow:'hidden',paddingHorizontal:9,paddingVertical:4,fontSize:13,fontWeight:'600'},
  action:{alignSelf:'flex-start',minHeight:46,paddingVertical:9,paddingHorizontal:13,borderRadius:11,borderWidth:1,justifyContent:'center'},
  actionLabel:{fontSize:15,fontWeight:'600'},
  settings:{gap:10},
  option:{minHeight:56,padding:12,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',gap:12},
});
