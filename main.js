import './style.css'

import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, addDoc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDNgvYTGglKaHlpzL3Jqz1is5jcG5sX25g",
  authDomain: "video-chat-8b18c.firebaseapp.com",
  projectId: "video-chat-8b18c",
  storageBucket: "video-chat-8b18c.appspot.com",
  messagingSenderId: "214031011708",
  appId: "1:214031011708:web:4d7373a0710fd0dbd8def9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};


// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;


// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const joinCode = document.getElementById('joinCode');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');


// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  callInput.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
  hangupButton.disabled = false;
}

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = doc(collection(db, "calls"));
  const offerCandidates = collection(callDoc, "offerCandidates")
  const answerCandidates = collection(callDoc, "answerCandidates")

  joinCode.innerText = `PASS CODE: ${callDoc.id}`;
  answerButton.disabled = true;
  callInput.disabled = true;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && addDoc(offerCandidates, event.candidate.toJSON())
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDoc, { offer });

  // Listen for remote answer
  onSnapshot(callDoc, (doc) => {
    console.log("Listening To Remote Answer", doc.data())
    const data = doc.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  })


  // When answered, add candidate to peer connection
  onSnapshot(answerCandidates, (doc) => {
    doc.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });



};


// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = doc(db, "calls", callId);
  const answerCandidates = collection(callDoc, "answerCandidates");
  const offerCandidates = collection(callDoc, "offerCandidates");


  pc.onicecandidate = (event) => {

    event.candidate && addDoc(answerCandidates, event.candidate.toJSON())
  };

  const callData = (await getDoc(callDoc)).data();

  const offerDescription = callData.offer;

  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDoc, { answer });

  onSnapshot(offerCandidates, (doc) => {
    doc.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

}

// 3. Answer the call with the unique ID
hangupButton.onclick = async () => {
  localStream.getAudioTracks()[0].stop();
  localStream.getVideoTracks()[0].stop();
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;
  pc.close();

  callButton.disabled = true;
  callInput.disabled = true;
  answerButton.disabled = true;
  webcamButton.disabled = false;
  hangupButton.disabled = true;
}