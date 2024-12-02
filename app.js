const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  }),
});

const app = express();
app.use(cors());
app.use(express.json());

app.post('/enviar-notificacion-oferta', async (req, res) => {
  try {
    const { negocioId, mensaje, codigo, fechaInicio, fechaFin } = req.body;

    if (!negocioId || !mensaje || !codigo || !fechaInicio || !fechaFin) {
      return res.status(400).json({
        error: 'Parámetros requeridos: negocioId, mensaje, código, fechaInicio, fechaFin.',
      });
    }

    const db = admin.firestore();

    const negocioDoc = await db.collection('negocios').doc(negocioId).get();
    if (!negocioDoc.exists) {
      return res.status(404).json({ error: 'Negocio no encontrado.' });
    }

    const negocioData = negocioDoc.data();
    const nombreNegocio = negocioData.nombre || 'Negocio desconocido';

    if (!negocioData.suscripciones || negocioData.suscripciones.length === 0) {
      return res.status(404).json({
        error: 'No se encontraron usuarios suscritos al negocio especificado.',
      });
    }


    const tokens = [];
    for (const suscripcion of negocioData.suscripciones) {
      try {
        const usuarioDoc = await db.collection('usuarios').doc(suscripcion.usuarioId).get();
        if (usuarioDoc.exists) {
          const usuarioData = usuarioDoc.data();
          if (usuarioData.fcmToken) {
            tokens.push(usuarioData.fcmToken);
          }
        }
      } catch (error) {
        console.warn(`Error al obtener datos del usuario ${suscripcion.usuarioId}: ${error.message}`);
        continue;
      }
    }

    if (tokens.length === 0) {
      return res.status(404).json({
        error: 'No se encontraron tokens FCM válidos para los usuarios suscritos.',
      });
    }


    const payload = {
      notification: {
        title: `Nueva promoción de ${nombreNegocio} con el código ${codigo}`,
        body: mensaje,
      },
    };


    const responses = [];
    for (const token of tokens) {
      try {
        const response = await admin.messaging().send({
          token,
          ...payload,
        });
        responses.push({ token, response });
      } catch (error) {
        console.warn(`Error al enviar notificación al token ${token}: ${error.message}`);
        responses.push({ token, error: error.message });
      }
    }

    return res.status(200).json({
      mensaje: 'Notificación enviada exitosamente.',
      resultados: responses,
    });
  } catch (error) {
    console.error('Error al enviar notificación:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Configuración del puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
