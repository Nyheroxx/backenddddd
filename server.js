const { v4: uuidv4 } = require('uuid');
const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();

// Express app'i başlat
const app = express();

// CORS middleware'i burada tanımlanmalı
const cors = require("cors");
app.use(cors({
  origin: "https://enesocakci.com", // Frontend'in çalıştığı domain
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

// JSON veri işleme middleware'i
app.use(bodyParser.json());
app.use(express.json());

const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

// Firebase Admin SDK'yı başlat
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();
const likesCollection = db.collection("likes");

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor...`);
});

// 🔥 Admin Girişi API’si
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Firebase Admin SDK, şifre doğrulama işlemini yapmaz, sadece e-posta ile kullanıcı verilerini alır
    const userRecord = await auth.getUserByEmail(email);

    // Kullanıcıyı bulduysak, ancak şifreyi doğrulamak için Firebase istemcisini kullanmalısınız
    // Şifre doğrulama işlemini burada yapamıyoruz, bunun için istemci tarafında firebase.auth().signInWithEmailAndPassword kullanmak gerekir

    res.status(200).json({
      message: "Giriş başarılı!",
      user: userRecord,
    });
  } catch (error) {
    console.error("Hata:", error);
    return res.status(401).json({
      message: "Geçersiz giriş bilgileri!",
    });
  }
});


// 🔥 Mesaj Gönderme API’si
app.post("/api/send-message", async (req, res) => {
  const { Name, Soyad, email, subject, message } = req.body;

  try {
    await db.collection("messages").add({
      Name,
      Soyad,
      email,
      subject,
      message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ message: "Mesaj başarıyla gönderildi!" });
  } catch (error) {
    res.status(500).json({ message: "Mesaj gönderilirken hata oluştu.", error });
  }
});

// 🔥 Admin Panelinde Mesajları Listeleme API’si
app.get("/messages", async (req, res) => {
  try {
    const messagesSnapshot = await db.collection("messages").orderBy("timestamp", "desc").get();
    const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: "Mesajlar alınırken hata oluştu.", error });
  }
});

// 🌟 Proje Ekleme Endpoint'i
app.post("/add-project", async (req, res) => {
  const { title, description, imageUrl } = req.body;

  try {
    const projectRef = await db.collection("projects").add({
      title,
      description,
      imageUrl,
      likes: 0,
      comments: [],
      offers: [],
    });

    res.status(200).json({ message: "Proje başarıyla eklendi!", id: projectRef.id });
  } catch (error) {
    res.status(500).json({ message: "Proje eklenirken hata oluştu.", error });
  }
});

// 🌟 Proje Listeleme Endpoint'i
app.get("/projects", async (req, res) => {
  try {
    const snapshot = await db.collection("projects").get();
    const projects = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ message: "Projeler alınırken hata oluştu.", error });
  }
});

// 🌟 Proje Beğenme Endpoint'i
// Beğenme işlemini takip etmek için bir koleksiyon oluştur
const likesCollection = db.collection("likes");

app.post("/like-project", async (req, res) => {
  const { projectId, userId } = req.body; // userId veya IP adresi kullanılabilir
  const userIdentifier = userId || req.ip; // Kullanıcıyı tanımlamak için IP veya userId

  try {
    // Kullanıcının bu projeyi daha önce beğenip beğenmediğini kontrol et
    const likeDoc = await likesCollection.doc(`${projectId}_${userIdentifier}`).get();

    if (likeDoc.exists) {
      return res.status(400).json({ message: "Bu projeyi zaten beğendiniz!" });
    }

    // Projenin beğeni sayısını artır
    const projectRef = db.collection("projects").doc(projectId);
    await projectRef.update({
      likes: admin.firestore.FieldValue.increment(1)
    });

    // Kullanıcının beğenme işlemini kaydet
    await likesCollection.doc(`${projectId}_${userIdentifier}`).set({
      projectId,
      userIdentifier,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({ message: "Proje beğenildi!" });
  } catch (error) {
    res.status(500).json({ message: "Beğenme işlemi başarısız.", error });
  }
});

// 🌟 Teklif Ekleme Endpoint'i
app.post("/add-offer", async (req, res) => {
  const { projectId, email, subject, amount } = req.body;

  if (!projectId || !email || !subject || !amount) {
    return res.status(400).json({ message: "Tüm alanları doldurun." });
  }

  const newOffer = {
    offerId: uuidv4(), // UUID ile rastgele ID oluştur
    projectId,
    email,
    subject,
    amount,
    status: "beklemede", // Başlangıçta teklif durumu "beklemede"
    timestamp: admin.firestore.FieldValue.serverTimestamp() // Zaman damgası ekle
  };

  try {
    await db.collection("offers").add(newOffer); // Firebase'e kaydediyoruz
    res.json({ message: "Teklif başarıyla gönderildi!", offer: newOffer });
  } catch (error) {
    res.status(500).json({ message: "Teklif gönderilirken hata oluştu.", error });
  }
});

// 🌟 Teklif Listeleme Endpoint'i
app.get("/offers", async (req, res) => {
  try {
    const offersSnapshot = await db.collection("offers").orderBy("timestamp", "desc").get();
    const offers = offersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Firestore belge ID'si ekleniyor
    res.status(200).json(offers);
  } catch (error) {
    res.status(500).json({ message: "Teklifler alınırken hata oluştu.", error });
  }
});

// 🌟 Teklif Onaylama Endpoint'i
app.post('/approve-offer', async (req, res) => {
  const { offerId } = req.body;
  console.log("approve-offer endpoint'i çağrıldı. offerId:", offerId);

  try {
    const offerRef = db.collection("offers").doc(offerId);
    const offerDoc = await offerRef.get();

    if (!offerDoc.exists) {
      console.log("Teklif bulunamadı!");
      return res.status(404).json({ message: "Teklif bulunamadı!" });
    }

    await offerRef.update({ status: "onaylandı" });
    console.log("Teklif onaylandı!");
    res.status(200).json({ message: "Teklif onaylandı!" });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ message: "Teklif onaylanırken hata oluştu.", error: error.message });
  }
});

// 🌟 Teklif Reddetme Endpoint'i
app.delete('/reject-offer', async (req, res) => {
  const { offerId } = req.body;
  console.log("reject-offer endpoint'i çağrıldı. offerId:", offerId);

  try {
    const offerRef = db.collection("offers").doc(offerId);
    const offerDoc = await offerRef.get();

    if (!offerDoc.exists) {
      console.log("Teklif bulunamadı!");
      return res.status(404).json({ message: "Teklif bulunamadı!" });
    }

    await offerRef.update({ status: "reddedildi" });
    console.log("Teklif reddedildi!");
    res.status(200).json({ message: "Teklif reddedildi!" });
  } catch (error) {
    console.error("Hata:", error);
    res.status(500).json({ message: "Teklif reddedilirken hata oluştu.", error: error.message });
  }
});
