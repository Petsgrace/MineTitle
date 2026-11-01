import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    ChevronRight, ChevronLeft, Upload, Landmark, User, MapPin, 
    FileCheck, Users, AlertCircle, WifiOff, Save, CheckCircle, 
    Camera, DollarSign, ShieldCheck, Printer, RotateCcw, Plus, Trash2, Lock
} from 'lucide-react';
import Breadcrumb from '../components/Breadcrumb';
import SignaturePad from '../components/SignaturePad';
import PhotoCapture from '../components/PhotoCapture';
import paymentService, { getProcessingFee, getActivePaymentRecord, clearActivePaymentRecord } from '../services/paymentService';
import { saveFormDraft, getFormDraft, clearFormDraft, addToQueue, saveBeneficiaryMedia, recordLocalAuditLog } from '../utils/offlineDB';
import mobileService from '../services/mobileService';
import api from '../services/api';

const ZIM_DISTRICTS = [
    "Harare", "Bulawayo", "Goromonzi", "Mazowe", "Chegutu", "Marondera", 
    "Bindura", "Gweru", "Mutare", "Chinhoyi", "Makonde", "Zvimba", 
    "Seke", "Shurugwi", "Kwekwe", "Kadoma", "Masvingo", "Chiredzi", 
    "Hwange", "Lupane", "Beitbridge", "Gwanda", "Chipinge", "Nyanga"
];

const NATURAL_REGIONS = [
    { value: "Region I", label: "Natural Region I (Specialized & Diversified Farming - High Rainfall >1000mm)" },
    { value: "Region IIa", label: "Natural Region IIa (Intensive Farming - 750-1000mm)" },
    { value: "Region IIb", label: "Natural Region IIb (Semi-Intensive Farming - 750-1000mm)" },
    { value: "Region III", label: "Natural Region III (Semi-Intensive Farming - 650-800mm)" },
    { value: "Region IV", label: "Natural Region IV (Semi-Extensive Farming - 450-650mm)" },
    { value: "Region V", label: "Natural Region V (Extensive Cattle Ranching & Wildlife - <450mm)" }
];

const LAND_CLASSES = [
    "Class I (Arable, Prime Soils)", 
    "Class II (Arable, Good Soils)", 
    "Class III (Arable, Moderate Limitations)", 
    "Class IV (Arable, Severe Limitations)", 
    "Class V (Grazing / Non-Arable)", 
    "Class VI (Grazing & Forestry)", 
    "Class VII (Forestry & Wildlife)", 
    "Class VIII (Wildlife / Rough Mountainous)"
];

const TENURE_DOC_TYPES = [
    "A2 Permit", 
    "Offer Letter", 
    "99-year lease", 
    "A1 Settlement Permit", 
    "A1 temporary permit", 
    "ALSA Lease"
];

const ZIM_ID_REGEX = /^\d{2}-\d{6,7}[A-Z]\d{2}$/i;

const ApplicationForm = ({ user }) => {
    // Current step:
    // 0: Payment Gate
    // 'receipt': Confirmed Receipt Display
    // 1: Part 1 - Farm Details
    // 2: Part 2 - Beneficiary Details
    // 3: Part 3 - Spouse Details
    // 4: Review Screen
    // 5: Submission Confirmation
    const [currentStep, setCurrentStep] = useState(0);

    const isOfficial = user && user.role && user.role !== 'farmer';
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('id');

    // Payment state
    const [paymentRecord, setPaymentRecord] = useState(null);
    const [selectedProvider, setSelectedProvider] = useState('mock');
    const [paymentPhone, setPaymentPhone] = useState(user?.phone_number || '');
    const [isPaying, setIsPaying] = useState(false);
    const [paymentError, setPaymentError] = useState('');

    // Dynamic Lists
    const [improvements, setImprovements] = useState([
        { type: 'Homestead', description: 'Main brick under iron farm house', condition: 'Good' }
    ]);
    const [spouses, setSpouses] = useState([
        { 
            surname: '', 
            first_name: '', 
            other_names: '', 
            title: 'Mrs.', 
            dob: '', 
            national_id: '', 
            phone: '', 
            citizenship: 'Zimbabwean', 
            photoFront: null,
            photoSide: null,
            idFront: null,
            idBack: null,
            signature: null,
            signatureDate: new Date().toISOString().split('T')[0]
        }
    ]);
    const [selectedLandClasses, setSelectedLandClasses] = useState(['Class II (Arable, Good Soils)']);
    const [selectedWaterSources, setSelectedWaterSources] = useState(['borehole']);

    // Farmer Categories Multi-Select
    const [farmerCategories, setFarmerCategories] = useState({
        war_veteran: false,
        uniformed_forces: false,
        business_person: false,
        youth: false,
        civil_servant: false,
        mp_senator: false,
        disabled: false,
        zepdra: false,
        councilor: false,
        traditional_chief: false,
        ordinary: true,
        other: false
    });

    // Beneficiary Biometrics & Photos
    const [beneficiaryPhotoFront, setBeneficiaryPhotoFront] = useState(null);
    const [beneficiaryPhotoSide, setBeneficiaryPhotoSide] = useState(null);
    const [beneficiaryIdFront, setBeneficiaryIdFront] = useState(null);
    const [beneficiaryIdBack, setBeneficiaryIdBack] = useState(null);

    // Signatures
    const [beneficiarySignature, setBeneficiarySignature] = useState(null);
    const [beneficiarySignDate, setBeneficiarySignDate] = useState(new Date().toISOString().split('T')[0]);
    const [spouseSignature, setSpouseSignature] = useState(null);
    const [spouseSignDate, setSpouseSignDate] = useState(new Date().toISOString().split('T')[0]);

    // Official Use Only Section
    const [officialCompiledBy, setOfficialCompiledBy] = useState({
        name: isOfficial ? user?.name || '' : '',
        designation: isOfficial ? 'Resettlement Verifying Officer' : '',
        signature: null,
        date: new Date().toISOString().split('T')[0]
    });
    const [officialCheckedBy, setOfficialCheckedBy] = useState({
        name: '',
        designation: 'Senior Registrar / LIMS Lands Officer',
        signature: null,
        date: new Date().toISOString().split('T')[0]
    });
    const [tenureDocStatus, setTenureDocStatus] = useState('VALID'); // 'VALID' or 'NOT_VALID'

    // Form Hook
    const { register, handleSubmit, watch, setValue, getValues, reset, formState: { errors } } = useForm({
        defaultValues: {
            // Part 1
            district: 'Goromonzi',
            farm_id: '',
            farm_name: '',
            subdivision_number: '',
            farm_extent: '',
            tenure_document_type: 'Offer Letter',
            farm_survey_status: 'Partially Surveyed',
            gazette_date: '',
            nearest_town: 'Harare',
            distance_to_town: '25',
            distance_to_main_road: '4.5',
            natural_region: 'Region IIa',
            water_capacity_details: 'Perennial borehole with 5,000L storage tank',
            
            // Part 2
            surname: user?.surname || '',
            first_name: user?.first_name || '',
            other_names: '',
            sex: 'Male',
            title: 'Mr.',
            dob_day: '15',
            dob_month: '06',
            dob_year: '1982',
            national_id: user?.national_id || '',
            marital_status: 'Married',
            citizenship: 'Zimbabwean',
            telephone: user?.phone_number || '',
            contact_address: '',
            email: user?.email || '',
            war_vet_number: '',
            force_number: '',
            ec_number: '',
            civil_service_years: '',
            other_category_specify: '',
        }
    });

    const maritalStatus = watch('marital_status');

    // Offline / Sync status
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [draftSavedMessage, setDraftSavedMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionResult, setSubmissionResult] = useState(null);
    const [formError, setFormError] = useState('');

    // GPS Status
    const [isLocating, setIsLocating] = useState(false);
    const [gpsStatus, setGpsStatus] = useState(null);

    // Initial check for payment gate
    useEffect(() => {
        const activePayment = getActivePaymentRecord();
        if (activePayment) {
            setPaymentRecord(activePayment);
            if (currentStep === 0) {
                setCurrentStep(1);
            }
        } else {
            setCurrentStep(0);
        }

        // Restore offline draft if available
        getFormDraft('application-draft').then(draft => {
            if (draft && draft.formData) {
                reset(draft.formData);
                if (draft.improvements) setImprovements(draft.improvements);
                if (draft.spouses) setSpouses(draft.spouses);
                if (draft.farmerCategories) setFarmerCategories(draft.farmerCategories);
                if (draft.selectedLandClasses) setSelectedLandClasses(draft.selectedLandClasses);
                if (draft.selectedWaterSources) setSelectedWaterSources(draft.selectedWaterSources);
                if (draft.beneficiaryPhotoFront) setBeneficiaryPhotoFront(draft.beneficiaryPhotoFront);
                if (draft.beneficiaryPhotoSide) setBeneficiaryPhotoSide(draft.beneficiaryPhotoSide);
                if (draft.beneficiaryIdFront) setBeneficiaryIdFront(draft.beneficiaryIdFront);
                if (draft.beneficiaryIdBack) setBeneficiaryIdBack(draft.beneficiaryIdBack);
                if (draft.beneficiarySignature) setBeneficiarySignature(draft.beneficiarySignature);
                if (draft.beneficiarySignDate) setBeneficiarySignDate(draft.beneficiarySignDate);
                if (draft.spouseSignature) setSpouseSignature(draft.spouseSignature);
                if (draft.spouseSignDate) setSpouseSignDate(draft.spouseSignDate);
                if (draft.paymentRecord && !activePayment) setPaymentRecord(draft.paymentRecord);
                if (draft.currentStep && (activePayment || draft.paymentRecord)) setCurrentStep(draft.currentStep);
                setDraftSavedMessage('Draft restored from local offline storage');
                setTimeout(() => setDraftSavedMessage(''), 4000);
            }
        }).catch(err => console.log('Draft restore note:', err));
    }, []);

    // Save draft after each step
    const autoSaveDraft = async () => {
        try {
            const formData = getValues();
            const draftPayload = {
                currentStep,
                formData,
                improvements,
                spouses,
                farmerCategories,
                selectedLandClasses,
                selectedWaterSources,
                beneficiaryPhotoFront,
                beneficiaryPhotoSide,
                beneficiaryIdFront,
                beneficiaryIdBack,
                beneficiarySignature,
                beneficiarySignDate,
                spouseSignature,
                spouseSignDate,
                paymentRecord,
                savedAt: new Date().toISOString()
            };
            await saveFormDraft('application-draft', draftPayload);
            setDraftSavedMessage('Draft auto-saved successfully (offline ready)');
            setTimeout(() => setDraftSavedMessage(''), 3000);
        } catch (e) {
            console.warn('Auto-save notice:', e);
        }
    };

    // Step 0: Payment Gate Handlers
    const handlePayFee = async (simulateFail = false) => {
        setIsPaying(true);
        setPaymentError('');
        try {
            const beneficiaryName = `${getValues('first_name') || user?.first_name || 'Citizen'} ${getValues('surname') || user?.surname || 'Applicant'}`.trim();
            const natId = getValues('national_id') || user?.national_id || '63-0000000X00';

            const record = await paymentService.processPayment({
                provider: selectedProvider,
                beneficiaryName,
                nationalId: natId,
                phoneNumber: paymentPhone,
                simulateFailure: simulateFail
            });

            setPaymentRecord(record);
            setCurrentStep('receipt');
        } catch (err) {
            setPaymentError(err.message || 'Payment processing failed. Please try again.');
        } finally {
            setIsPaying(false);
        }
    };

    // Mobile GPS Capture
    const handleCaptureGPS = async () => {
        setIsLocating(true);
        setGpsStatus(null);
        try {
            const loc = await mobileService.getCurrentLocation();
            setValue('latitude', Number(loc.latitude.toFixed(6)));
            setValue('longitude', Number(loc.longitude.toFixed(6)));
            setGpsStatus(`GPS Locked: ${loc.latitude.toFixed(5)}°, ${loc.longitude.toFixed(5)}° (±${Math.round(loc.accuracy || 5)}m)`);
        } catch (err) {
            setFormError(err.message || 'Unable to acquire GPS fix. Please verify device location permissions.');
        } finally {
            setIsLocating(false);
        }
    };

    // Validation for Part 1
    const validatePart1 = () => {
        const values = getValues();
        if (!values.district) return "Field 1.1 District is required.";
        if (!values.farm_name) return "Field 1.2 Farm Name is required.";
        if (!values.farm_extent || Number(values.farm_extent) <= 0) return "Field 1.3 Farm Extent (Hectares) must be a positive number.";
        if (!values.tenure_document_type) return "Field 1.4 Land Tenure Document is required.";
        if (!values.gazette_date) return "Field 1.6 Farm Gazette Date is required.";
        return null;
    };

    // Validation for Part 2
    const validatePart2 = () => {
        const values = getValues();
        if (!values.surname) return "Field 2.1 Surname: is required.";
        if (!values.first_name) return "Field 2.2 First Name: is required.";
        if (!values.national_id) return "Field 2.7 National ID Number: is required.";
        
        const cleanId = values.national_id.replace(/\s+/g, '').toUpperCase();
        if (!ZIM_ID_REGEX.test(cleanId) && cleanId.length < 9) {
            return "Field 2.7 National ID format is invalid for Zimbabwe. Example: 63-1234567-X-63";
        }

        if (!values.telephone) return "Field 2.10 Telephone Number: is required.";
        if (!values.contact_address) return "Field 2.11 Contact Address: is required.";
        if (!values.email || !values.email.includes('@')) return "Field 2.12 Valid Email Address: is required.";

        if (farmerCategories.war_veteran && !values.war_vet_number) {
            return "War Veteran No.: is required when War Veteran category is ticked.";
        }
        if (farmerCategories.uniformed_forces && !values.force_number) {
            return "Force No.: is required when Uniformed Forces category is ticked.";
        }
        if (farmerCategories.civil_servant) {
            if (!values.ec_number) return "EC Number: is required when Civil Servant category is ticked.";
            if (!values.civil_service_years) return "Field 2.13.1 Years in civil service: is required.";
        }
        if (farmerCategories.other && !values.other_category_specify) {
            return "Please specify the other category description.";
        }

        // Biometrics and Identity verification
        if (!beneficiaryPhotoFront) {
            return "Beneficiary Front Face Photo: is required before proceeding.";
        }
        if (!beneficiaryPhotoSide) {
            return "Beneficiary Side Profile Photo: is required before proceeding.";
        }
        if (!beneficiaryIdFront) {
            return "Beneficiary National ID / Passport (Front): is required before proceeding.";
        }
        if (!beneficiaryIdBack) {
            return "Beneficiary National ID / Passport (Back): is required before proceeding.";
        }

        return null;
    };

    // Validation for Part 3
    const validatePart3 = () => {
        if (maritalStatus === 'Married') {
            if (!spouses || spouses.length === 0) {
                return "At least one spouse's details are required for Married status.";
            }
            for (let i = 0; i < spouses.length; i++) {
                const s = spouses[i];
                if (!s.surname || !s.first_name) {
                    return `Spouse #${i + 1} Surname and First Name: are required.`;
                }
                if (!s.national_id) {
                    return `Spouse #${i + 1} National ID: is required.`;
                }
                if (!s.photoFront) {
                    return `Spouse #${i + 1} Front Face Photo: is required.`;
                }
                if (!s.photoSide) {
                    return `Spouse #${i + 1} Side Profile Photo: is required.`;
                }
                if (!s.idFront) {
                    return `Spouse #${i + 1} National ID / Passport (Front): is required.`;
                }
                if (!s.idBack) {
                    return `Spouse #${i + 1} National ID / Passport (Back): is required.`;
                }
                if (!s.signature) {
                    return `Spouse #${i + 1} Signature: is required. Please tap the signature box to sign.`;
                }
            }
        }
        return null;
    };

    // Step Transition Handlers
    const handleNext = async () => {
        setFormError('');
        if (currentStep === 1) {
            const err = validatePart1();
            if (err) { setFormError(err); return; }
            await autoSaveDraft();
            setCurrentStep(2);
        } else if (currentStep === 2) {
            const err = validatePart2();
            if (err) { setFormError(err); return; }
            await autoSaveDraft();
            setCurrentStep(3);
        } else if (currentStep === 3) {
            const err = validatePart3();
            if (err) { setFormError(err); return; }
            await autoSaveDraft();
            setCurrentStep(4);
        }
    };

    const handleBack = () => {
        setFormError('');
        if (currentStep === 2) setCurrentStep(1);
        else if (currentStep === 3) setCurrentStep(2);
        else if (currentStep === 4) setCurrentStep(3);
    };

    // Final Submission Handler (Comprehensive Parts 1, 2, 3 + Biometrics + Idempotency)
    const handleFinalSubmit = async () => {
        if (!beneficiarySignature) {
            setFormError("Signature of Main Beneficiary is required before final submission.");
            return;
        }

        setIsSubmitting(true);
        setFormError('');

        try {
            const formValues = getValues();
            const idempotencyKey = 'IDEM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

            // Assemble complete statutory payload
            const formattedDob = (formValues.dob_year && formValues.dob_month && formValues.dob_day)
                ? `${formValues.dob_year}-${String(formValues.dob_month).padStart(2, '0')}-${String(formValues.dob_day).padStart(2, '0')}`
                : null;

            const activeFarmerCategories = Object.keys(farmerCategories).filter(k => farmerCategories[k]);

            const validSpouses = spouses
                .filter(s => s.first_name || s.surname || s.national_id)
                .map(s => ({
                    surname: s.surname || '',
                    first_name: s.first_name || '',
                    other_names: s.other_names || '',
                    title: s.title || 'Mrs.',
                    date_of_birth: s.dob || s.date_of_birth || null,
                    national_id: s.national_id || '',
                    telephone: s.phone || s.telephone || '',
                    citizenship: s.citizenship || 'Zimbabwean',
                    photo_front: s.photoFront || s.photo_front || null,
                    photo_side: s.photoSide || s.photo_side || null,
                    id_front: s.idFront || s.id_front || null,
                    id_back: s.idBack || s.id_back || null,
                    signature: s.signature || null,
                    signature_date: s.signatureDate || s.signature_date || new Date().toISOString().split('T')[0]
                }));

            const payload = {
                // Part 1: Farm Details
                district: formValues.district,
                farm_id: formValues.farm_id || formValues.plot_number || '',
                plot_number: formValues.plot_number || formValues.farm_id || '',
                subdivision_number: formValues.subdivision_number || '',
                farm_name: formValues.farm_name,
                farm_extent: formValues.farm_extent ? parseFloat(formValues.farm_extent) : null,
                tenure_document_type: formValues.tenure_document_type,
                farm_survey_status: formValues.farm_survey_status || 'Partially Surveyed',
                gazette_date: formValues.gazette_date || null,
                nearest_town: formValues.nearest_town || '',
                distance_to_town: formValues.distance_to_town ? parseFloat(formValues.distance_to_town) : null,
                distance_to_main_road: formValues.distance_to_main_road ? parseFloat(formValues.distance_to_main_road) : 0,
                natural_region: formValues.natural_region || '',
                water_capacity_details: formValues.water_capacity_details || '',
                selected_land_classes: selectedLandClasses,
                selected_water_sources: selectedWaterSources,
                improvements_list: improvements,
                gps_latitude: gpsStatus?.latitude || null,
                gps_longitude: gpsStatus?.longitude || null,

                // Part 2: Main Beneficiary Details
                surname: formValues.surname,
                first_name: formValues.first_name,
                other_names: formValues.other_names || '',
                sex: formValues.sex || 'Male',
                title: formValues.title || 'Mr.',
                date_of_birth: formattedDob,
                national_id: formValues.national_id,
                marital_status: formValues.marital_status || 'Married',
                citizenship: formValues.citizenship || 'Zimbabwean',
                telephone: formValues.telephone,
                contact_address: formValues.contact_address || '',
                email: formValues.email || '',
                farmer_categories_list: activeFarmerCategories,
                is_war_veteran: !!farmerCategories.war_veteran,
                war_vet_number: formValues.war_vet_number || null,
                is_ex_detainee: !!farmerCategories.ex_detainee,
                is_collaborator: !!farmerCategories.collaborator,
                is_uniformed_forces: !!farmerCategories.uniformed_forces,
                force_number: formValues.force_number || null,
                is_civil_servant: !!farmerCategories.civil_servant,
                ec_number: formValues.ec_number || null,
                civil_service_years: formValues.civil_service_years ? parseInt(formValues.civil_service_years) : null,
                is_business_person: !!farmerCategories.business_person,
                is_youth: !!farmerCategories.youth,
                is_mp_senator: !!farmerCategories.mp_senator,
                is_disabled: !!farmerCategories.disabled,
                is_zepdra: !!farmerCategories.zepdra,
                is_councilor: !!farmerCategories.councilor,
                is_traditional_chief: !!farmerCategories.traditional_chief,
                is_ordinary: !!farmerCategories.ordinary,
                is_other: !!farmerCategories.other,
                other_category_specify: formValues.other_category_specify || '',

                // Part 3: Spouses
                spouses: validSpouses,

                // Biometrics, Photos & Signatures
                beneficiary_photo_front: beneficiaryPhotoFront,
                beneficiary_photo_side: beneficiaryPhotoSide,
                beneficiary_id_front: beneficiaryIdFront,
                beneficiary_id_back: beneficiaryIdBack,
                beneficiary_signature: beneficiarySignature,
                beneficiary_signature_date: beneficiarySignDate,

                // Official & Payment Tracking
                statutory_fee_receipt: paymentRecord?.receiptNumber || '',
                statutory_fee_paid: true,
                idempotency_key: idempotencyKey,

                // Assisted capture compatibility
                walk_in_citizen_name: `${formValues.first_name} ${formValues.surname}`,
                walk_in_national_id: formValues.national_id,
                walk_in_phone: formValues.telephone
            };

            const persistSubmissionLocally = (serverData = {}, isLocalFallback = false) => {
                try {
                    const existing = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]');
                    const fallbackRef = `TD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
                    const refNo = serverData.reference_number || fallbackRef;
                    const nowIso = new Date().toISOString();

                    // Store full high-res photos & signatures in IndexedDB keyed by refNo & receiptNumber
                    saveBeneficiaryMedia(refNo, {
                        beneficiary_photo_front: beneficiaryPhotoFront,
                        beneficiary_photo_side: beneficiaryPhotoSide,
                        beneficiary_id_front: beneficiaryIdFront,
                        beneficiary_id_back: beneficiaryIdBack,
                        beneficiary_signature: beneficiarySignature,
                        spouses: validSpouses
                    });
                    if (paymentRecord?.receiptNumber) {
                        saveBeneficiaryMedia(paymentRecord.receiptNumber, {
                            beneficiary_photo_front: beneficiaryPhotoFront,
                            beneficiary_photo_side: beneficiaryPhotoSide,
                            beneficiary_id_front: beneficiaryIdFront,
                            beneficiary_id_back: beneficiaryIdBack,
                            beneficiary_signature: beneficiarySignature,
                            spouses: validSpouses
                        });
                    }

                    const lightSpouses = validSpouses.map(({ photo_front, photo_side, id_front, id_back, ...rest }) => ({
                        ...rest,
                        has_photos: Boolean(photo_front && photo_side)
                    }));

                    const newApp = {
                        ...payload,
                        spouses: lightSpouses,
                        id: serverData.id || (editId ? Number(editId) || editId : Date.now()),
                        reference_number: refNo,
                        farm_name: formValues.farm_name || serverData.farm_name || 'Land Parcel',
                        farmer: `${formValues.first_name} ${formValues.surname}`.trim(),
                        farmer_name: formValues.first_name,
                        farmer_surname: formValues.surname,
                        status: serverData.status || 'PENDING',
                        created_at: serverData.created_at || nowIso,
                        updated_at: serverData.updated_at || nowIso,
                        statutory_fee_receipt: serverData.statutory_fee_receipt || paymentRecord?.receiptNumber || 'N/A',
                        receipt_number: serverData.receipt_number || serverData.statutory_fee_receipt || paymentRecord?.receiptNumber || 'N/A',
                        district: formValues.district || serverData.district || 'Unassigned',
                        statutory_fee_amount: serverData.statutory_fee_amount || 10.0,
                        local_updated: isLocalFallback || Boolean(editId),
                        synced: !isLocalFallback,
                        ...serverData
                    };

                    const updated = [
                        newApp,
                        ...existing.filter(a => a && a.reference_number !== newApp.reference_number && String(a.id) !== String(newApp.id))
                    ];

                    try {
                        localStorage.setItem('my_submitted_applications', JSON.stringify(updated));
                    } catch (quotaErr) {
                        // Strip heavy photo dataUrls from localStorage copy if quota is tight; IndexedDB retains full photos
                        const compactUpdated = updated.map(({ beneficiary_photo_front, beneficiary_photo_side, beneficiary_id_front, beneficiary_id_back, ...lite }) => ({
                            ...lite,
                            has_biometric_photos: true
                        }));
                        localStorage.setItem('my_submitted_applications', JSON.stringify(compactUpdated));
                    }

                    recordLocalAuditLog({
                        action_type: editId ? 'APPLICATION_UPDATED' : 'APPLICATION_SUBMITTED',
                        reference_number: refNo,
                        actor: `${formValues.first_name} ${formValues.surname}`.trim() || 'Beneficiary Applicant',
                        from_stage: 'APPLICANT_CAPTURE',
                        to_stage: newApp.status || 'PENDING',
                        comment: `Submitted 3-Part Title Deed Application for ${newApp.farm_name} (${formValues.tenure_document_type || 'Offer Letter'}, Receipt: ${newApp.receipt_number})${isLocalFallback ? ' [Offline Queued]' : ''}.`
                    });

                    return newApp;
                } catch (cacheErr) {
                    console.warn('Could not cache submission in localStorage:', cacheErr);
                    return null;
                }
            };

            // Offline handling: if device is offline, queue to IndexedDB and save to localStorage so Dashboard updates immediately
            if (!navigator.onLine) {
                const savedOffline = persistSubmissionLocally({}, true);
                try {
                    await addToQueue({
                        url: editId ? `/applications/${editId}/` : '/applications/',
                        method: editId ? 'PATCH' : 'POST',
                        body: { ...payload, reference_number: savedOffline?.reference_number, updated_at: new Date().toISOString() },
                        idempotency_key: idempotencyKey,
                        entity_type: 'application',
                        timestamp: new Date().toISOString()
                    });
                } catch (qErr) {
                    console.warn('Offline queue note:', qErr);
                }
                await clearFormDraft('application-draft');
                clearActivePaymentRecord();
                setSubmissionResult({
                    referenceNumber: savedOffline?.reference_number || 'Queued - will sync when online',
                    receiptNumber: paymentRecord?.receiptNumber || 'Pending Sync',
                    submittedAt: new Date().toLocaleString(),
                    farmName: formValues.farm_name,
                    beneficiaryName: `${formValues.first_name} ${formValues.surname}`,
                    status: '1. PENDING (Saved Locally - Queued for Sync)'
                });
                setCurrentStep(5);
                return;
            }

            // Online submission (or update if editId is provided)
            const res = editId && api.patch
                ? await api.patch(`/applications/${editId}/`, payload)
                : await api.post('/applications/', payload);
            if (!res.data || (!res.data.reference_number && !res.data.id)) {
                throw new Error('Server response missing official reference number. Submission unverified.');
            }

            await clearFormDraft('application-draft');
            clearActivePaymentRecord();

            const cachedApp = persistSubmissionLocally(res.data, false);

            setSubmissionResult({
                referenceNumber: res.data.reference_number || cachedApp?.reference_number,
                receiptNumber: res.data.statutory_fee_receipt || paymentRecord?.receiptNumber || 'No receipt on file',
                submittedAt: new Date().toLocaleString(),
                farmName: formValues.farm_name,
                beneficiaryName: `${formValues.first_name} ${formValues.surname}`,
                status: '1. PENDING (Resettlement Review)'
            });

            setCurrentStep(5);
        } catch (err) {
            // If network/server is unreachable (e.g. mobile APK offline or local server down), persist locally so dashboard updates
            if (!err.response) {
                const formValues = getValues();
                const savedOffline = (() => {
                    try {
                        const existing = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]');
                        const fallbackRef = `TD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
                        const nowIso = new Date().toISOString();
                        const newApp = {
                            ...formValues,
                            id: editId ? Number(editId) || editId : Date.now(),
                            reference_number: fallbackRef,
                            farm_name: formValues.farm_name || 'Land Parcel',
                            farmer: `${formValues.first_name} ${formValues.surname}`.trim(),
                            farmer_name: formValues.first_name,
                            farmer_surname: formValues.surname,
                            beneficiary_signature: beneficiarySignature,
                            beneficiary_signature_date: beneficiarySignDate,
                            status: 'PENDING',
                            created_at: nowIso,
                            updated_at: nowIso,
                            statutory_fee_receipt: paymentRecord?.receiptNumber || 'N/A',
                            receipt_number: paymentRecord?.receiptNumber || 'N/A',
                            district: formValues.district || 'Unassigned',
                            statutory_fee_amount: 10.0,
                            local_updated: true,
                            synced: false
                        };
                        saveBeneficiaryMedia(fallbackRef, {
                            beneficiary_photo_front: beneficiaryPhotoFront,
                            beneficiary_photo_side: beneficiaryPhotoSide,
                            beneficiary_id_front: beneficiaryIdFront,
                            beneficiary_id_back: beneficiaryIdBack,
                            beneficiary_signature: beneficiarySignature
                        });
                        const updated = [
                            newApp,
                            ...existing.filter(a => a && a.reference_number !== newApp.reference_number && String(a.id) !== String(newApp.id))
                        ];
                        localStorage.setItem('my_submitted_applications', JSON.stringify(updated));
                        recordLocalAuditLog({
                            action_type: 'APPLICATION_SUBMITTED',
                            reference_number: fallbackRef,
                            actor: newApp.farmer || 'Beneficiary Applicant',
                            from_stage: 'APPLICANT_CAPTURE',
                            to_stage: 'PENDING',
                            comment: `Submitted application for ${newApp.farm_name} (Receipt: ${newApp.receipt_number}) [Offline Queued].`
                        });
                        return newApp;
                    } catch (e) {
                        return null;
                    }
                })();
                try {
                    if (typeof addToQueue === 'function') {
                        await addToQueue({
                            url: editId ? `/applications/${editId}/` : '/applications/',
                            method: editId ? 'PATCH' : 'POST',
                            body: {
                                ...getValues(),
                                reference_number: savedOffline?.reference_number,
                                statutory_fee_receipt: paymentRecord?.receiptNumber || '',
                                statutory_fee_paid: true,
                                beneficiary_signature: beneficiarySignature,
                                beneficiary_signature_date: beneficiarySignDate,
                                updated_at: new Date().toISOString()
                            },
                            idempotency_key: savedOffline?.reference_number || `app-${Date.now()}`,
                            entity_type: 'application',
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (qErr) {
                    console.warn('Queue fallback note:', qErr);
                }
                await clearFormDraft('application-draft');
                clearActivePaymentRecord();
                setSubmissionResult({
                    referenceNumber: savedOffline?.reference_number || `TD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
                    receiptNumber: paymentRecord?.receiptNumber || 'Confirmed',
                    submittedAt: new Date().toLocaleString(),
                    farmName: formValues.farm_name,
                    beneficiaryName: `${formValues.first_name} ${formValues.surname}`,
                    status: '1. PENDING (Resettlement Review)'
                });
                setCurrentStep(5);
                return;
            }

            // Real error reporting for validation errors from server
            const serverMsg = err.response?.data?.error || 
                              err.response?.data?.statutory_fee_receipt || 
                              err.response?.data?.national_id || 
                              err.response?.data?.detail || 
                              err.message || 
                              "Failed to submit application to the Lands Ministry. Please review errors and retry.";
            setFormError(typeof serverMsg === 'string' ? serverMsg : JSON.stringify(serverMsg));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Dynamic Improvements Helpers
    const addImprovement = () => {
        setImprovements([...improvements, { type: '', description: '', condition: 'Fair' }]);
    };
    const removeImprovement = (index) => {
        setImprovements(improvements.filter((_, i) => i !== index));
    };
    const updateImprovement = (index, field, value) => {
        const updated = [...improvements];
        updated[index][field] = value;
        setImprovements(updated);
    };

    // Dynamic Spouses Helpers
    const addSpouse = () => {
        setSpouses([...spouses, { 
            surname: '', 
            first_name: '', 
            other_names: '', 
            title: 'Mrs.', 
            dob: '', 
            national_id: '', 
            phone: '', 
            citizenship: 'Zimbabwean', 
            photoFront: null,
            photoSide: null,
            idFront: null,
            idBack: null,
            signature: null,
            signatureDate: new Date().toISOString().split('T')[0]
        }]);
    };
    const removeSpouse = (index) => {
        setSpouses(spouses.filter((_, i) => i !== index));
    };
    const updateSpouse = (index, field, value) => {
        const updated = [...spouses];
        updated[index][field] = value;
        setSpouses(updated);
    };

    // Land Class Toggle
    const toggleLandClass = (cls) => {
        if (selectedLandClasses.includes(cls)) {
            setSelectedLandClasses(selectedLandClasses.filter(c => c !== cls));
        } else {
            setSelectedLandClasses([...selectedLandClasses, cls]);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-16 px-2 sm:px-4">
            <Breadcrumb items={[{ label: 'Home', path: '/' }, { label: 'Title Deeds Form', path: '/apply' }]} />

            {/* Offline & Auto-save Alerts */}
            {isOffline && (
                <div className="bg-amber-500/15 border border-amber-500/40 text-amber-900 rounded-xl p-3 mb-4 flex items-center gap-3 text-sm">
                    <WifiOff size={18} className="text-amber-700 flex-shrink-0" />
                    <span><strong>Offline Mode Active:</strong> Rural network disconnected. Your inputs and file attachments are stored securely in local IndexedDB and will synchronize upon reconnection.</span>
                </div>
            )}
            {draftSavedMessage && (
                <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-900 rounded-xl p-2.5 mb-4 flex items-center gap-2 text-xs font-semibold">
                    <Save size={16} className="text-emerald-700" />
                    <span>{draftSavedMessage}</span>
                </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 0 - PAYMENT GATE (Strict Gate)                                       */}
            {/* ========================================================================= */}
            {currentStep === 0 && (
                <div className="card bg-white shadow-xl rounded-2xl border border-emerald-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-gray-900 p-6 sm:p-8">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                                <DollarSign size={28} />
                            </div>
                            <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Statutory Prerequisite • Step 0</span>
                                <h2 className="text-xl sm:text-2xl font-black">Statutory Processing Fee Gate</h2>
                            </div>
                        </div>
                        <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
                            Ministry of Lands, Agriculture, Fisheries, Water and Rural Development — Statutory Title Deed Processing.
                        </p>
                    </div>

                    <div className="p-6 sm:p-8 space-y-6">
                        {/* Prominent Mandatory Fee Notice (Exactly per Spec) */}
                        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-amber-950 flex items-start gap-4 shadow-sm">
                            <ShieldCheck size={26} className="text-amber-700 flex-shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-bold text-base sm:text-lg mb-1">Processing Fee Notice</h3>
                                <p className="font-semibold text-amber-900 text-sm sm:text-base">
                                    "A processing fee of USD $10 is required for your file to be attended to."
                                </p>
                                <p className="text-xs text-amber-700 mt-1">
                                    The statutory fee is fixed and mandatory under the Land Commission Act. Once payment is confirmed, an official receipt number will be issued to unlock the application form.
                                </p>
                            </div>
                        </div>

                        {paymentError && (
                            <div className="alert alert-error bg-rose-50 border border-rose-300 text-rose-900 p-4 rounded-xl flex items-center gap-3">
                                <AlertCircle size={20} className="text-rose-600 flex-shrink-0" />
                                <span>{paymentError}</span>
                            </div>
                        )}

                        {/* Fee Details Box (Fixed USD $10.00 - strictly non-editable) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Fixed Statutory Fee
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-black text-emerald-800">USD $10.00</span>
                                    <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                                        <Lock size={11} /> Non-editable
                                    </span>
                                </div>
                                <span className="text-xs text-slate-400 mt-1 block">Statutory Title Deed Processing Fee</span>
                            </div>

                            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Target Beneficiary
                                </label>
                                <div className="text-sm font-bold text-slate-800">
                                    {user?.name || `${getValues('first_name') || 'Citizen'} ${getValues('surname') || 'Applicant'}`}
                                </div>
                                <div className="text-xs text-slate-500">
                                    National ID: {user?.national_id || getValues('national_id') || 'To be validated'}
                                </div>
                            </div>
                        </div>

                        {/* Payment Method Integration */}
                        <div>
                            <label className="block text-sm font-bold text-slate-800 mb-3">
                                Select Payment Gateway / Integration:
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { id: 'ecocash', name: 'EcoCash Pay', desc: 'USD Mobile Money' },
                                    { id: 'onemoney', name: 'OneMoney', desc: 'NetOne USD' },
                                    { id: 'zimswitch', name: 'ZimSwitch / vPay', desc: 'Local Bank Debit' },
                                    { id: 'visa_mastercard', name: 'Visa / Mastercard', desc: 'International Cards' },
                                ].map((p) => (
                                    <div 
                                        key={p.id}
                                        onClick={() => setSelectedProvider(p.id)}
                                        className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${selectedProvider === p.id ? 'border-emerald-600 bg-emerald-50/60 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                    >
                                        <div className="font-bold text-sm text-slate-800">{p.name}</div>
                                        <div className="text-xs text-slate-500">{p.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Mobile Phone for USSD Prompt */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Mobile Payment Phone Number (for USSD push prompt)
                            </label>
                            <input 
                                type="tel"
                                value={paymentPhone}
                                onChange={(e) => setPaymentPhone(e.target.value)}
                                placeholder="e.g. 0771 234 567"
                                className="input w-full max-w-md border-slate-300 focus:border-emerald-600"
                            />
                            <p className="text-xs text-slate-400 mt-1">A payment authorization push will be dispatched to your handset.</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-3">
                            <button
                                type="button"
                                onClick={() => handlePayFee(false)}
                                disabled={isPaying}
                                className="btn w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg flex items-center justify-center gap-2 text-base transition-all"
                            >
                                <DollarSign size={20} />
                                {isPaying ? 'Processing Payment with Gateway...' : 'Pay USD $10.00 & Generate Receipt'}
                            </button>

                            <button
                                type="button"
                                onClick={() => handlePayFee(true)}
                                disabled={isPaying}
                                className="btn w-full sm:w-auto border border-rose-300 text-rose-700 hover:bg-rose-50 font-medium py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5"
                                title="Test requirement: If payment fails or is cancelled, return to payment screen and do not create receipt."
                            >
                                <AlertCircle size={14} />
                                Simulate Cancel / Payment Failure
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 0 - RECEIPT DISPLAY (Upon Confirmed Payment)                         */}
            {/* ========================================================================= */}
            {currentStep === 'receipt' && paymentRecord && (
                <div className="card bg-white shadow-xl rounded-2xl border border-emerald-200 p-6 sm:p-8 space-y-6">
                    <div className="text-center pb-6 border-b border-slate-200">
                        <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                            <CheckCircle size={14} className="text-emerald-600" /> Payment Confirmed
                        </span>
                        <h2 className="text-2xl font-black text-slate-800">Ministry of Lands and Rural Development</h2>
                        <h3 className="text-sm font-semibold text-slate-600">OFFICIAL STATUTORY PROCESSING FEE RECEIPT</h3>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-3">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                PROCESSING FEE: RECEIPT NUMBER
                            </span>
                            <span className="text-xl font-black text-emerald-900 tracking-wide font-mono bg-white px-3 py-1 rounded-lg border border-emerald-300 shadow-sm">
                                {paymentRecord.receiptNumber}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-1">
                            <div>
                                <span className="text-xs text-slate-500 block">Amount Paid</span>
                                <strong className="text-emerald-700 text-base">USD $10.00</strong>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500 block">Gateway</span>
                                <strong className="capitalize text-slate-800">{paymentRecord.provider}</strong>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500 block">Date / Timestamp</span>
                                <strong className="text-slate-800">{new Date(paymentRecord.timestamp).toLocaleDateString()}</strong>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500 block">Status</span>
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-200/60 px-2 py-0.5 rounded">CONFIRMED</span>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                        This receipt number has been permanently anchored to your title deed dossier. It will be visibly printed on every part of your application form and official verification registers.
                    </p>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setCurrentStep(1)}
                            className="btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg flex items-center gap-2 text-base"
                        >
                            <span>Continue to Part 1: Farm Details</span>
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MAIN FORM FLOW (Parts 1, 2, 3, Review) with Strict Receipt Banner         */}
            {/* ========================================================================= */}
            {currentStep >= 1 && currentStep <= 4 && (
                <div className="space-y-6">
                    {/* Top Mandatory Receipt Banner on Every Part (Requirement 5) */}
                    <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-gray-900 rounded-xl p-3.5 px-5 shadow-md flex flex-wrap items-center justify-between gap-3 border border-emerald-700">
                        <div className="flex items-center gap-2.5">
                            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-700">
                                PROCESSING FEE: RECEIPT NUMBER:
                            </span>
                            <span className="font-mono font-black text-sm sm:text-base bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-500/50 text-gray-900 shadow-inner">
                                {paymentRecord?.receiptNumber || 'No receipt on file'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                            <CheckCircle size={15} className="text-emerald-400" />
                            <span>STATUTORY FEE PAID: USD $10.00</span>
                        </div>
                    </div>

                    {/* Progress Indicator (Requirement: Part X of 3) */}
                    <div className="card bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {currentStep === 1 && "Part 1 of 3: Farm Details"}
                                {currentStep === 2 && "Part 2 of 3: Details of the Beneficiary"}
                                {currentStep === 3 && "Part 3 of 3: Spouse Details"}
                                {currentStep === 4 && "Application Review & Verification"}
                            </span>
                            <span className="text-xs font-bold text-emerald-700">
                                {currentStep === 4 ? "Final Step" : `Step ${currentStep} of 3`}
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                                className="bg-emerald-600 h-full transition-all duration-300"
                                style={{ width: `${(Math.min(currentStep, 3) / 3) * 100}%` }}
                            />
                        </div>
                    </div>

                    {formError && (
                        <div className="alert alert-error bg-rose-50 border border-rose-300 text-rose-900 p-4 rounded-xl flex items-center gap-3">
                            <AlertCircle size={20} className="text-rose-600 flex-shrink-0" />
                            <span className="text-sm font-semibold">{formError}</span>
                        </div>
                    )}

                    <form className="space-y-6">
                        {/* PART 1 - FARM DETAILS */}
                        {currentStep === 1 && (
                            <div className="card bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                                <div className="border-b border-slate-200 pb-4">
                                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <MapPin className="text-emerald-600" size={22} />
                                        PART 1 - FARM DETAILS
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Provide accurate geographical, cadastral, and tenure details of the land asset.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            1.1 District *
                                        </label>
                                        <select 
                                            {...register('district', { required: true })}
                                            className="input w-full border-slate-300"
                                        >
                                            {ZIM_DISTRICTS.map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            1.1 Farm ID / Cadastral Number
                                        </label>
                                        <input 
                                            type="text"
                                            {...register('farm_id')}
                                            placeholder="e.g. GRZ-FARM-0842"
                                            className="input w-full border-slate-300"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-1">
                                        1.2 Farm Name *
                                    </label>
                                    <input 
                                        type="text"
                                        {...register('farm_name', { required: true })}
                                        placeholder="e.g. Sambi Ranch Subdivision 4"
                                        className="input w-full border-slate-300"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            1.3 Plot / Subdivision Number
                                        </label>
                                        <input 
                                            type="text"
                                            {...register('subdivision_number')}
                                            placeholder="e.g. Plot 4B"
                                            className="input w-full border-slate-300"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            1.3 Farm Extent (in Hectares) *
                                        </label>
                                        <input 
                                            type="number"
                                            step="0.01"
                                            {...register('farm_extent', { required: true })}
                                            placeholder="e.g. 150.50"
                                            className="input w-full border-slate-300 font-semibold"
                                        />
                                    </div>
                                </div>

                                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
                                    <label className="block text-sm font-bold text-slate-800">
                                        1.4 Current Land Tenure Document *
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">Document Category</span>
                                            <select 
                                                {...register('tenure_document_type')}
                                                className="input w-full border-slate-300"
                                            >
                                                {TENURE_DOC_TYPES.map(t => (
                                                    <option key={t} value={t}>{t}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">Attach Certified Photocopy</span>
                                            <input 
                                                type="file" 
                                                accept="image/*,application/pdf"
                                                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                                <Lock size={12} /> Official Use Only: Tenure Document Status
                                            </span>
                                            {!isOfficial && (
                                                <span className="text-[11px] text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded font-medium">
                                                    Read-Only for Beneficiary
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-6 text-sm">
                                            <label className={`flex items-center gap-2 ${!isOfficial ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}>
                                                <input 
                                                    type="radio"
                                                    name="tenure_status_radio"
                                                    checked={tenureDocStatus === 'VALID'}
                                                    onChange={() => isOfficial && setTenureDocStatus('VALID')}
                                                    disabled={!isOfficial}
                                                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <span className="font-semibold text-emerald-800">Valid</span>
                                            </label>
                                            <label className={`flex items-center gap-2 ${!isOfficial ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}>
                                                <input 
                                                    type="radio"
                                                    name="tenure_status_radio"
                                                    checked={tenureDocStatus === 'NOT_VALID'}
                                                    onChange={() => isOfficial && setTenureDocStatus('NOT_VALID')}
                                                    disabled={!isOfficial}
                                                    className="w-4 h-4 text-rose-600 focus:ring-rose-500"
                                                />
                                                <span className="font-semibold text-rose-800">Not Valid</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-1">
                                        1.5 Farm Survey Status
                                    </label>
                                    <select 
                                        {...register('farm_survey_status')}
                                        className="input w-full border-slate-300"
                                    >
                                        <option value="Surveyed">Fully Surveyed (Surveyor General Approved Diagram)</option>
                                        <option value="Partially Surveyed">Partially Surveyed (Beacons Established)</option>
                                        <option value="Not Surveyed">Not Surveyed (Perimeter Estimated)</option>
                                        <option value="Cadastral Beacon Placed">Cadastral Beacon Placed</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-1">
                                        1.6 Farm Gazette Date (in full) *
                                    </label>
                                    <input 
                                        type="date"
                                        {...register('gazette_date', { required: true })}
                                        className="input w-full border-slate-300"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Official publication date in the Zimbabwe Government Gazette.</p>
                                </div>

                                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                                    <label className="block text-sm font-bold text-slate-800">
                                        1.7 Nearest Town & Distances
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">1.7 Nearest Town / City</span>
                                            <input 
                                                type="text"
                                                {...register('nearest_town')}
                                                placeholder="e.g. Marondera"
                                                className="input w-full border-slate-300"
                                            />
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">1.7.1 Approx. distance to Town (km)</span>
                                            <input 
                                                type="number"
                                                step="0.1"
                                                {...register('distance_to_town')}
                                                placeholder="e.g. 18"
                                                className="input w-full border-slate-300"
                                            />
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">1.7.2 Approx. distance to main road (km)</span>
                                            <input 
                                                type="number"
                                                step="0.1"
                                                {...register('distance_to_main_road')}
                                                placeholder="e.g. 3.2"
                                                className="input w-full border-slate-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-1">
                                        1.8 Natural Region
                                    </label>
                                    <select 
                                        {...register('natural_region')}
                                        className="input w-full border-slate-300"
                                    >
                                        {NATURAL_REGIONS.map(r => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-2">
                                        1.9 Land Class/Classes (Multi-select)
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {LAND_CLASSES.map(cls => (
                                            <label 
                                                key={cls}
                                                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${selectedLandClasses.includes(cls) ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}
                                            >
                                                <input 
                                                    type="checkbox"
                                                    checked={selectedLandClasses.includes(cls)}
                                                    onChange={() => toggleLandClass(cls)}
                                                    className="w-4 h-4 text-emerald-600 rounded"
                                                />
                                                <span>{cls}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-1">
                                        1.10 Available Water Source / Capacity on the farm
                                    </label>
                                    <input 
                                        type="text"
                                        {...register('water_capacity_details')}
                                        placeholder="e.g. 1 x Perennial Dam (50,000 m³), 2 x Solar Boreholes delivering 4,000 L/hr"
                                        className="input w-full border-slate-300"
                                    />
                                </div>

                                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-800">
                                                1.11 Farm Improvements Found on the Farm
                                            </h4>
                                            <span className="text-xs text-slate-500">Record all built structures, barns, irrigation, and fixed assets.</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addImprovement}
                                            className="text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1"
                                        >
                                            <Plus size={14} /> Add Item
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {improvements.map((item, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-slate-200">
                                                <div className="col-span-4">
                                                    <input 
                                                        type="text"
                                                        value={item.type}
                                                        onChange={(e) => updateImprovement(idx, 'type', e.target.value)}
                                                        placeholder="Item (e.g. Tobacco Barn)"
                                                        className="input text-xs w-full py-1.5"
                                                    />
                                                </div>
                                                <div className="col-span-5">
                                                    <input 
                                                        type="text"
                                                        value={item.description}
                                                        onChange={(e) => updateImprovement(idx, 'description', e.target.value)}
                                                        placeholder="Description / Hectarage"
                                                        className="input text-xs w-full py-1.5"
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <select 
                                                        value={item.condition}
                                                        onChange={(e) => updateImprovement(idx, 'condition', e.target.value)}
                                                        className="input text-xs w-full py-1.5"
                                                    >
                                                        <option value="Excellent">Excellent</option>
                                                        <option value="Good">Good</option>
                                                        <option value="Fair">Fair</option>
                                                        <option value="Dilapidated">Dilapidated</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-1 text-center">
                                                    {improvements.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeImprovement(idx)}
                                                            className="text-rose-500 hover:text-rose-700 p-1"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="border border-emerald-200 bg-emerald-50/40 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                            <MapPin size={16} className="text-emerald-600" />
                                            Mobile GPS Cadastral Beacon Fix
                                        </div>
                                        <p className="text-xs text-slate-500">Acquire precision centroid coordinates using device hardware GPS.</p>
                                        {gpsStatus && <p className="text-xs font-semibold text-emerald-800 mt-1">{gpsStatus}</p>}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCaptureGPS}
                                        disabled={isLocating}
                                        className="btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 self-start sm:self-auto"
                                    >
                                        <MapPin size={14} />
                                        {isLocating ? 'Acquiring Fix...' : 'Acquire GPS Fix'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* PART 2 - DETAILS OF THE BENEFICIARY */}
                        {currentStep === 2 && (
                            <div className="card bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                                <div className="border-b border-slate-200 pb-4">
                                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <User className="text-emerald-600" size={22} />
                                        PART 2 - DETAILS OF THE BENEFICIARY
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Beneficiary personal profile, identification, and statutory farmer categorization.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.1 Surname *
                                        </label>
                                        <input 
                                            type="text"
                                            {...register('surname', { required: true })}
                                            placeholder="e.g. Moyo"
                                            className="input w-full border-slate-300"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.2 First Name *
                                        </label>
                                        <input 
                                            type="text"
                                            {...register('first_name', { required: true })}
                                            placeholder="e.g. Tendai"
                                            className="input w-full border-slate-300"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.3 Other Names
                                        </label>
                                        <input 
                                            type="text"
                                            {...register('other_names')}
                                            placeholder="e.g. Blessing"
                                            className="input w-full border-slate-300"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.4 Sex *
                                        </label>
                                        <select {...register('sex')} className="input w-full border-slate-300">
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.5 Title *
                                        </label>
                                        <select {...register('title')} className="input w-full border-slate-300">
                                            <option value="Mr.">Mr.</option>
                                            <option value="Mrs.">Mrs.</option>
                                            <option value="Miss">Miss</option>
                                            <option value="Ms.">Ms.</option>
                                            <option value="Dr.">Dr.</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                                    <label className="block text-sm font-bold text-slate-800 mb-2">
                                        2.6 Date of Birth (Day, Month, Year) *
                                    </label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">Day</span>
                                            <select {...register('dob_day')} className="input w-full text-sm">
                                                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">Month</span>
                                            <select {...register('dob_month')} className="input w-full text-sm">
                                                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, idx) => (
                                                    <option key={m} value={idx + 1}>{m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-500 block mb-1">Year</span>
                                            <select {...register('dob_year')} className="input w-full text-sm">
                                                {Array.from({ length: 80 }, (_, i) => 2010 - i).map(y => (
                                                    <option key={y} value={y}>{y}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.7 National ID Number *
                                        </label>
                                        <input 
                                            type="text"
                                            {...register('national_id', { required: true })}
                                            placeholder="e.g. 63-1234567X63"
                                            className="input w-full border-slate-300 font-mono"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">Zimbabwean ID Format: XX-XXXXXXX-X-XX</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.8 Marital Status * (Single Selection)
                                        </label>
                                        <select {...register('marital_status')} className="input w-full border-slate-300 font-semibold">
                                            <option value="Married">Married</option>
                                            <option value="Single">Single</option>
                                            <option value="Divorced">Divorced</option>
                                            <option value="Widowed">Widowed</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.9 Citizenship *
                                        </label>
                                        <select {...register('citizenship')} className="input w-full border-slate-300">
                                            <option value="Zimbabwean">Zimbabwean</option>
                                            <option value="South African">South African</option>
                                            <option value="Zambian">Zambian</option>
                                            <option value="Mozambican">Mozambican</option>
                                            <option value="Botswanan">Botswanan</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800 mb-1">
                                            2.10 Telephone Number *
                                        </label>
                                        <input 
                                            type="tel"
                                            {...register('telephone', { required: true })}
                                            placeholder="e.g. 0772 345 678"
                                            className="input w-full border-slate-300"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-1">
                                        2.11 Contact Address *
                                    </label>
                                    <textarea 
                                        {...register('contact_address', { required: true })}
                                        rows={2}
                                        placeholder="Physical residential or postal address in Zimbabwe"
                                        className="input w-full border-slate-300"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-800 mb-1">
                                        2.12 Email Address *
                                    </label>
                                    <input 
                                        type="email"
                                        {...register('email', { required: true })}
                                        placeholder="e.g. tendai.moyo@gmail.com"
                                        className="input w-full border-slate-300"
                                    />
                                </div>

                                <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-800">
                                            2.13 Farmer Category (Multi-select, tick all that apply) *
                                        </label>
                                        <p className="text-xs text-slate-500">Conditional verification inputs appear for audited state categories.</p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {[
                                            { key: 'war_veteran', label: 'War Veteran' },
                                            { key: 'uniformed_forces', label: 'Uniformed Forces' },
                                            { key: 'business_person', label: 'Business Person' },
                                            { key: 'youth', label: 'Youth (35 years and below)' },
                                            { key: 'civil_servant', label: 'Civil Servant' },
                                            { key: 'mp_senator', label: 'MP / Senator' },
                                            { key: 'disabled', label: 'Disabled' },
                                            { key: 'zepdra', label: 'ZEPDRA' },
                                            { key: 'councilor', label: 'Councilor' },
                                            { key: 'traditional_chief', label: 'Traditional Chief' },
                                            { key: 'ordinary', label: 'Ordinary' },
                                            { key: 'other', label: 'Other (specify)' }
                                        ].map(cat => (
                                            <label 
                                                key={cat.key}
                                                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${farmerCategories[cat.key] ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}
                                            >
                                                <input 
                                                    type="checkbox"
                                                    checked={farmerCategories[cat.key]}
                                                    onChange={(e) => setFarmerCategories({ ...farmerCategories, [cat.key]: e.target.checked })}
                                                    className="w-4 h-4 text-emerald-600 rounded"
                                                />
                                                <span>{cat.label}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {farmerCategories.war_veteran && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                            <label className="block text-xs font-bold text-emerald-900 mb-1">
                                                War Veteran No. * (Required)
                                            </label>
                                            <input 
                                                type="text"
                                                {...register('war_vet_number')}
                                                placeholder="e.g. WV/1980/74921"
                                                className="input w-full text-xs"
                                            />
                                        </div>
                                    )}

                                    {farmerCategories.uniformed_forces && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                            <label className="block text-xs font-bold text-emerald-900 mb-1">
                                                Force No * (Required)
                                            </label>
                                            <input 
                                                type="text"
                                                {...register('force_number')}
                                                placeholder="e.g. ZNA/984210"
                                                className="input w-full text-xs"
                                            />
                                        </div>
                                    )}

                                    {farmerCategories.civil_servant && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
                                            <div>
                                                <label className="block text-xs font-bold text-emerald-900 mb-1">
                                                    EC Number * (Required)
                                                </label>
                                                <input 
                                                    type="text"
                                                    {...register('ec_number')}
                                                    placeholder="e.g. EC-481920B"
                                                    className="input w-full text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-emerald-900 mb-1">
                                                    2.13.1 Years in civil service * (Required)
                                                </label>
                                                <input 
                                                    type="number"
                                                    {...register('civil_service_years')}
                                                    placeholder="e.g. 14"
                                                    className="input w-full text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {farmerCategories.other && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                            <label className="block text-xs font-bold text-emerald-900 mb-1">
                                                Other Category Specification * (Required)
                                            </label>
                                            <input 
                                                type="text"
                                                {...register('other_category_specify')}
                                                placeholder="Specify details"
                                                className="input w-full text-xs"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* 2.14 Beneficiary Biometrics & National ID Verification */}
                                <div className="border-t border-slate-200 pt-5 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                            <Camera className="text-emerald-700" size={18} />
                                            2.14 Beneficiary Biometric Photographs & Identity Documents *
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Statutory requirement: Capture or upload Front View face photo, Side Profile face photo, and Front & Back of your National ID or Passport.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <PhotoCapture
                                            label="Beneficiary Front View Face Photo *"
                                            type="face_front"
                                            value={beneficiaryPhotoFront}
                                            onChange={setBeneficiaryPhotoFront}
                                            required={true}
                                            personLabel="Beneficiary (Front View)"
                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                        />
                                        <PhotoCapture
                                            label="Beneficiary Side Profile Face Photo *"
                                            type="face_side"
                                            value={beneficiaryPhotoSide}
                                            onChange={setBeneficiaryPhotoSide}
                                            required={true}
                                            personLabel="Beneficiary (Side Profile)"
                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <PhotoCapture
                                            label="Beneficiary National ID / Passport (Front) *"
                                            type="id_front"
                                            value={beneficiaryIdFront}
                                            onChange={setBeneficiaryIdFront}
                                            required={true}
                                            personLabel="Beneficiary National ID (Front)"
                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                        />
                                        <PhotoCapture
                                            label="Beneficiary National ID / Passport (Back) *"
                                            type="id_back"
                                            value={beneficiaryIdBack}
                                            onChange={setBeneficiaryIdBack}
                                            required={true}
                                            personLabel="Beneficiary National ID (Back)"
                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PART 3 - SPOUSE DETAILS */}
                        {currentStep === 3 && (
                            <div className="card bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                                <div className="border-b border-slate-200 pb-4">
                                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <Users className="text-emerald-600" size={22} />
                                        PART 3 - SPOUSE DETAILS
                                    </h3>
                                    <div className="mt-2 bg-emerald-50 border border-emerald-300 rounded-lg p-3 text-xs text-emerald-900 font-semibold flex items-start gap-2">
                                        <AlertCircle size={16} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                                        <span>
                                            "Spouse(s) should give their correct details and attach certified photocopies of their National IDs."
                                        </span>
                                    </div>
                                </div>

                                {maritalStatus !== 'Married' ? (
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center space-y-3">
                                        <p className="text-sm text-slate-700 font-medium">
                                            Your marital status is selected as <strong>{maritalStatus}</strong>.
                                        </p>
                                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                                            As specified in the Land Tenure Regulations, Part 3 Spouse Details is not required for unmarried or widowed applicants. You may proceed directly to Review.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentStep(4)}
                                            className="btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2.5 px-6 rounded-lg inline-flex items-center gap-1.5"
                                        >
                                            <span>Skip to Review</span>
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                Spouse Records ({spouses.length})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={addSpouse}
                                                className="text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1"
                                            >
                                                <Plus size={14} /> Add Another Spouse
                                            </button>
                                        </div>

                                        {spouses.map((spouse, idx) => (
                                            <div key={idx} className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-slate-50/50 space-y-4 relative">
                                                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                                                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                                                        Spouse #{idx + 1}
                                                    </span>
                                                    {spouses.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeSpouse(idx)}
                                                            className="text-rose-500 hover:text-rose-700 text-xs flex items-center gap-1 font-semibold"
                                                        >
                                                            <Trash2 size={14} /> Remove Spouse
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.4 Title</label>
                                                        <select 
                                                            value={spouse.title}
                                                            onChange={(e) => updateSpouse(idx, 'title', e.target.value)}
                                                            className="input text-xs w-full"
                                                        >
                                                            <option value="Mrs.">Mrs.</option>
                                                            <option value="Mr.">Mr.</option>
                                                            <option value="Miss">Miss</option>
                                                            <option value="Ms.">Ms.</option>
                                                            <option value="Dr.">Dr.</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.1 Surname *</label>
                                                        <input 
                                                            type="text"
                                                            value={spouse.surname}
                                                            onChange={(e) => updateSpouse(idx, 'surname', e.target.value)}
                                                            placeholder="Surname"
                                                            className="input text-xs w-full"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.2 First Name *</label>
                                                        <input 
                                                            type="text"
                                                            value={spouse.first_name}
                                                            onChange={(e) => updateSpouse(idx, 'first_name', e.target.value)}
                                                            placeholder="First name"
                                                            className="input text-xs w-full"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.3 Other Names</label>
                                                        <input 
                                                            type="text"
                                                            value={spouse.other_names}
                                                            onChange={(e) => updateSpouse(idx, 'other_names', e.target.value)}
                                                            placeholder="Other names"
                                                            className="input text-xs w-full"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.5 Date of Birth</label>
                                                        <input 
                                                            type="date"
                                                            value={spouse.dob}
                                                            onChange={(e) => updateSpouse(idx, 'dob', e.target.value)}
                                                            className="input text-xs w-full"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.6 National ID *</label>
                                                        <input 
                                                            type="text"
                                                            value={spouse.national_id}
                                                            onChange={(e) => updateSpouse(idx, 'national_id', e.target.value)}
                                                            placeholder="e.g. 63-7654321Y63"
                                                            className="input text-xs w-full font-mono"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.7 Phone Number</label>
                                                        <input 
                                                            type="tel"
                                                            value={spouse.phone}
                                                            onChange={(e) => updateSpouse(idx, 'phone', e.target.value)}
                                                            placeholder="e.g. 0773 998 877"
                                                            className="input text-xs w-full"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">3.8 Citizenship</label>
                                                        <select 
                                                            value={spouse.citizenship}
                                                            onChange={(e) => updateSpouse(idx, 'citizenship', e.target.value)}
                                                            className="input text-xs w-full"
                                                        >
                                                            <option value="Zimbabwean">Zimbabwean</option>
                                                            <option value="South African">South African</option>
                                                            <option value="Zambian">Zambian</option>
                                                            <option value="Other">Other</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Spouse Biometrics & ID Attachments */}
                                                <div className="border-t border-slate-200/80 pt-4 space-y-3">
                                                    <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Camera size={14} className="text-emerald-700" />
                                                        Spouse #{idx + 1} Biometrics & National ID Documents *
                                                    </h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <PhotoCapture
                                                            label={`Spouse #${idx + 1} Front Face Photo *`}
                                                            type="face_front"
                                                            value={spouse.photoFront}
                                                            onChange={(val) => updateSpouse(idx, 'photoFront', val)}
                                                            required={true}
                                                            personLabel={`Spouse #${idx + 1} (Front View)`}
                                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                                        />
                                                        <PhotoCapture
                                                            label={`Spouse #${idx + 1} Side Profile Photo *`}
                                                            type="face_side"
                                                            value={spouse.photoSide}
                                                            onChange={(val) => updateSpouse(idx, 'photoSide', val)}
                                                            required={true}
                                                            personLabel={`Spouse #${idx + 1} (Side Profile)`}
                                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <PhotoCapture
                                                            label={`Spouse #${idx + 1} National ID / Passport (Front) *`}
                                                            type="id_front"
                                                            value={spouse.idFront}
                                                            onChange={(val) => updateSpouse(idx, 'idFront', val)}
                                                            required={true}
                                                            personLabel={`Spouse #${idx + 1} National ID (Front)`}
                                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                                        />
                                                        <PhotoCapture
                                                            label={`Spouse #${idx + 1} National ID / Passport (Back) *`}
                                                            type="id_back"
                                                            value={spouse.idBack}
                                                            onChange={(val) => updateSpouse(idx, 'idBack', val)}
                                                            required={true}
                                                            personLabel={`Spouse #${idx + 1} National ID (Back)`}
                                                            receiptNumber={paymentRecord?.receiptNumber || 'No receipt on file'}
                                                        />
                                                    </div>

                                                    {/* Full-Screen Signature Pad for Spouse */}
                                                    <div className="pt-2">
                                                        <SignaturePad
                                                            label={`Signature of Spouse #${idx + 1} *`}
                                                            existingSignature={spouse.signature}
                                                            onSave={(sig) => updateSpouse(idx, 'signature', sig)}
                                                            date={spouse.signatureDate || new Date().toISOString().split('T')[0]}
                                                            required={true}
                                                            personName={`${spouse.title || 'Spouse'} ${spouse.first_name || ''} ${spouse.surname || ''}`.trim()}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PART 4 - REVIEW & SIGNATURES & OFFICIAL USE ONLY */}
                        {currentStep === 4 && (
                            <div className="space-y-6">
                                <div className="card bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between border-b pb-3">
                                        <h3 className="text-lg font-black text-slate-800">Review Application Details</h3>
                                        <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full">
                                            Ready for Signatures
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                        <div className="p-3 bg-slate-50 rounded-lg space-y-1.5">
                                            <div className="font-bold text-emerald-800 text-sm mb-1">Farm Information: </div>
                                            <div><span className="font-semibold text-slate-600">Farm: </span>{getValues('farm_name')} ({getValues('subdivision_number') || 'N/A'})</div>
                                            <div><span className="font-semibold text-slate-600">District: </span>{getValues('district')} (ID: {getValues('farm_id') || 'N/A'})</div>
                                            <div><span className="font-semibold text-slate-600">Extent: </span>{getValues('farm_extent')} Hectares</div>
                                            <div><span className="font-semibold text-slate-600">Tenure Doc: </span>{getValues('tenure_document_type')}</div>
                                            <div><span className="font-semibold text-slate-600">Gazette Date: </span>{getValues('gazette_date')}</div>
                                            <div><span className="font-semibold text-slate-600">Region: </span>{getValues('natural_region')}</div>
                                        </div>

                                        <div className="p-3 bg-slate-50 rounded-lg space-y-1.5">
                                            <div className="font-bold text-emerald-800 text-sm mb-1">Beneficiary Profile: </div>
                                            <div><span className="font-semibold text-slate-600">Name: </span>{getValues('title')} {getValues('first_name')} {getValues('other_names')} {getValues('surname')}</div>
                                            <div><span className="font-semibold text-slate-600">National ID: </span>{getValues('national_id')}</div>
                                            <div><span className="font-semibold text-slate-600">Marital Status: </span>{getValues('marital_status')}</div>
                                            <div><span className="font-semibold text-slate-600">Phone: </span>{getValues('telephone')}</div>
                                            <div><span className="font-semibold text-slate-600">Email: </span>{getValues('email')}</div>
                                        </div>
                                    </div>

                                    {/* Beneficiary Biometrics Preview */}
                                    <div className="pt-3 border-t border-slate-200">
                                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                                            Beneficiary Biometrics & Identity Documents: 
                                        </span>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                            <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 text-center">
                                                <span className="text-[11px] font-bold text-slate-600 block mb-1">Front Face: </span>
                                                {beneficiaryPhotoFront ? (
                                                    <img src={beneficiaryPhotoFront} alt="Front Face" className="w-full h-20 object-cover rounded" />
                                                ) : <span className="text-rose-500 font-bold">Missing</span>}
                                            </div>
                                            <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 text-center">
                                                <span className="text-[11px] font-bold text-slate-600 block mb-1">Side Profile: </span>
                                                {beneficiaryPhotoSide ? (
                                                    <img src={beneficiaryPhotoSide} alt="Side Face" className="w-full h-20 object-cover rounded" />
                                                ) : <span className="text-rose-500 font-bold">Missing</span>}
                                            </div>
                                            <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 text-center">
                                                <span className="text-[11px] font-bold text-slate-600 block mb-1">ID (Front): </span>
                                                {beneficiaryIdFront ? (
                                                    beneficiaryIdFront.startsWith('data:application/pdf') ? (
                                                        <div className="w-full h-20 flex items-center justify-center bg-slate-200 text-xs font-bold text-slate-700 rounded">PDF Doc</div>
                                                    ) : <img src={beneficiaryIdFront} alt="ID Front" className="w-full h-20 object-cover rounded" />
                                                ) : <span className="text-rose-500 font-bold">Missing</span>}
                                            </div>
                                            <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 text-center">
                                                <span className="text-[11px] font-bold text-slate-600 block mb-1">ID (Back): </span>
                                                {beneficiaryIdBack ? (
                                                    beneficiaryIdBack.startsWith('data:application/pdf') ? (
                                                        <div className="w-full h-20 flex items-center justify-center bg-slate-200 text-xs font-bold text-slate-700 rounded">PDF Doc</div>
                                                    ) : <img src={beneficiaryIdBack} alt="ID Back" className="w-full h-20 object-cover rounded" />
                                                ) : <span className="text-rose-500 font-bold">Missing</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Spouse Biometrics & Signature Review */}
                                    {maritalStatus === 'Married' && spouses.length > 0 && (
                                        <div className="pt-3 border-t border-slate-200 space-y-3">
                                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                                                Spouse Records & Verified Documents: 
                                            </span>
                                            {spouses.map((s, sIdx) => (
                                                <div key={sIdx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="font-bold text-emerald-800">Spouse #{sIdx + 1}: {s.title} {s.first_name} {s.surname}</span>
                                                        <span className="font-mono text-slate-600">ID: {s.national_id}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[10px]">
                                                        <div className="border rounded p-1 bg-white">
                                                            <span className="block text-slate-500 mb-0.5">Front: </span>
                                                            {s.photoFront ? <img src={s.photoFront} className="w-full h-14 object-cover rounded" alt="Front" /> : <span className="text-rose-500">None</span>}
                                                        </div>
                                                        <div className="border rounded p-1 bg-white">
                                                            <span className="block text-slate-500 mb-0.5">Side: </span>
                                                            {s.photoSide ? <img src={s.photoSide} className="w-full h-14 object-cover rounded" alt="Side" /> : <span className="text-rose-500">None</span>}
                                                        </div>
                                                        <div className="border rounded p-1 bg-white">
                                                            <span className="block text-slate-500 mb-0.5">ID Front: </span>
                                                            {s.idFront ? (s.idFront.startsWith('data:application/pdf') ? <div className="h-14 flex items-center justify-center bg-slate-100 font-bold">PDF</div> : <img src={s.idFront} className="w-full h-14 object-cover rounded" alt="ID Front" />) : <span className="text-rose-500">None</span>}
                                                        </div>
                                                        <div className="border rounded p-1 bg-white">
                                                            <span className="block text-slate-500 mb-0.5">ID Back: </span>
                                                            {s.idBack ? (s.idBack.startsWith('data:application/pdf') ? <div className="h-14 flex items-center justify-center bg-slate-100 font-bold">PDF</div> : <img src={s.idBack} className="w-full h-14 object-cover rounded" alt="ID Back" />) : <span className="text-rose-500">None</span>}
                                                        </div>
                                                        <div className="border rounded p-1 bg-white col-span-2 sm:col-span-1">
                                                            <span className="block text-slate-500 mb-0.5">Signature: </span>
                                                            {s.signature ? <img src={s.signature} className="w-full h-14 object-contain rounded bg-slate-50" alt="Sig" /> : <span className="text-rose-500">Missing</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* END OF FORM: SIGNATURES */}
                                <div className="card bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                                    <div className="border-b border-slate-200 pb-3">
                                        <h3 className="text-lg font-black text-slate-800">
                                            STATUTORY SIGNATURES & AFFIDAVIT
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1">
                                            I/We hereby certify that the information given is true, correct, and complete to the best of my knowledge under the statutory provisions of the Deeds Registries Act.
                                        </p>
                                    </div>

                                    <SignaturePad 
                                        label="Signature of Main Beneficiary *"
                                        existingSignature={beneficiarySignature}
                                        onSave={(sig) => setBeneficiarySignature(sig)}
                                        date={beneficiarySignDate}
                                        required={true}
                                        personName={`${getValues('title')} ${getValues('first_name')} ${getValues('surname')}`.trim()}
                                    />

                                    {/* FOR OFFICIAL USE ONLY SECTION */}
                                    <div className="mt-8 border-2 border-emerald-800/30 rounded-xl p-5 bg-emerald-950/5 space-y-4">
                                        <div className="flex items-center justify-between border-b border-emerald-900/20 pb-2">
                                            <div>
                                                <h4 className="text-sm font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                                                    <ShieldCheck size={16} className="text-emerald-700" />
                                                    FOR OFFICIAL USE ONLY
                                                </h4>
                                                <span className="text-[11px] text-slate-500">Ministry of Lands Verifying Officers Section</span>
                                            </div>
                                            {!isOfficial ? (
                                                <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full flex items-center gap-1">
                                                    <Lock size={12} /> Restricted to Official Personnel
                                                </span>
                                            ) : (
                                                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
                                                    Official Edit Mode Active
                                                </span>
                                            )}
                                        </div>

                                        {!isOfficial ? (
                                            <div className="p-4 bg-white/70 border border-slate-200 rounded-lg text-center text-xs text-slate-500 italic">
                                                This section is reserved exclusively for Ministry of Lands Officers. Beneficiaries cannot fill or alter these entries. Upon submission, Resettlement and LIMS officers will complete the verification records below.
                                            </div>
                                        ) : (
                                            <div className="space-y-4 text-xs">
                                                <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
                                                    <span className="font-bold text-slate-800 block">Compiled By (Official Use)</span>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        <input 
                                                            type="text"
                                                            value={officialCompiledBy.name}
                                                            onChange={(e) => setOfficialCompiledBy({ ...officialCompiledBy, name: e.target.value })}
                                                            placeholder="Officer Full Name"
                                                            className="input text-xs w-full"
                                                        />
                                                        <input 
                                                            type="text"
                                                            value={officialCompiledBy.designation}
                                                            onChange={(e) => setOfficialCompiledBy({ ...officialCompiledBy, designation: e.target.value })}
                                                            placeholder="Official Designation"
                                                            className="input text-xs w-full"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
                                                    <span className="font-bold text-slate-800 block">Checked By (Official Use)</span>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        <input 
                                                            type="text"
                                                            value={officialCheckedBy.name}
                                                            onChange={(e) => setOfficialCheckedBy({ ...officialCheckedBy, name: e.target.value })}
                                                            placeholder="Checking Officer Name"
                                                            className="input text-xs w-full"
                                                        />
                                                        <input 
                                                            type="text"
                                                            value={officialCheckedBy.designation}
                                                            onChange={(e) => setOfficialCheckedBy({ ...officialCheckedBy, designation: e.target.value })}
                                                            placeholder="Senior Designation"
                                                            className="input text-xs w-full"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP NAVIGATION BUTTONS (Enhanced High-Visibility Navigation) */}
                        <div className="form-step-nav-bar">
                            {currentStep > 1 ? (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="btn-nav-prev"
                                >
                                    <ChevronLeft size={18} />
                                    <span>Previous Step</span>
                                </button>
                            ) : (
                                <div />
                            )}

                            <div className="flex items-center gap-3">
                                {currentStep < 4 ? (
                                    <button
                                        type="button"
                                        onClick={handleNext}
                                        className="btn-nav-next"
                                    >
                                        <span>Proceed to {currentStep === 1 ? "Part 2: Beneficiary Details" : currentStep === 2 ? "Part 3: Spouse Details" : "Part 4: Review"}</span>
                                        <ChevronRight size={18} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleFinalSubmit}
                                        disabled={isSubmitting}
                                        className="btn bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3.5 px-10 rounded-xl shadow-lg flex items-center gap-2 text-base"
                                    >
                                        <FileCheck size={20} />
                                        <span>{isSubmitting ? "Submitting Application..." : "Confirm & Submit Application"}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 5 - CONFIRMATION SCREEN (With Receipt & Reference Number)            */}
            {/* ========================================================================= */}
            {currentStep === 5 && submissionResult && (
                <div className="card bg-white shadow-xl rounded-2xl border border-emerald-200 p-6 sm:p-10 space-y-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                        <CheckCircle size={36} />
                    </div>

                    <div>
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest bg-emerald-100 px-3 py-1 rounded-full">
                            Statutory Submission Successful
                        </span>
                        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">
                            Application Filed with Lands Ministry
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto mt-1">
                            Your title deed application dossier has been received and entered into the national processing pipeline under the Deeds Registries Act.
                        </p>
                    </div>

                    <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-6 max-w-lg mx-auto space-y-4 text-left">
                        <div className="space-y-2 text-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-200/80 pb-2">
                                <span className="font-bold text-slate-700">Receipt Number: </span>
                                <span className="font-mono font-black text-emerald-950 text-base">{submissionResult.receiptNumber}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-200/80 pb-2">
                                <span className="font-bold text-slate-700">Ref Number: </span>
                                <span className="font-mono font-black text-emerald-800 text-lg">{submissionResult.referenceNumber}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-200/80 pb-2">
                                <span className="font-bold text-slate-700">Beneficiary: </span>
                                <span className="font-medium text-slate-900">{submissionResult.beneficiaryName}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-200/80 pb-2">
                                <span className="font-bold text-slate-700">Farm Name: </span>
                                <span className="font-medium text-slate-900">{submissionResult.farmName}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-200/80 pb-2">
                                <span className="font-bold text-slate-700">Time Stamp: </span>
                                <span className="font-medium text-slate-700">{submissionResult.submittedAt}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                                <span className="font-bold text-slate-700">Initial Stage: </span>
                                <span className="font-bold text-emerald-700">{submissionResult.status}</span>
                            </div>
                        </div>

                        {/* Summary of Biometrics & Signatures */}
                        <div className="pt-3 border-t border-emerald-200/80">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                                Attached Biometrics & Statutory Signatures: 
                            </span>
                            <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                                {beneficiaryPhotoFront && (
                                    <div className="p-1.5 bg-white border border-emerald-200 rounded-lg shadow-sm">
                                        <img src={beneficiaryPhotoFront} alt="Front Face" className="w-full h-14 object-cover rounded mb-1" />
                                        <span className="text-slate-600 block truncate font-medium">Front Face</span>
                                    </div>
                                )}
                                {beneficiaryPhotoSide && (
                                    <div className="p-1.5 bg-white border border-emerald-200 rounded-lg shadow-sm">
                                        <img src={beneficiaryPhotoSide} alt="Side Face" className="w-full h-14 object-cover rounded mb-1" />
                                        <span className="text-slate-600 block truncate font-medium">Side Profile</span>
                                    </div>
                                )}
                                {beneficiaryIdFront && (
                                    <div className="p-1.5 bg-white border border-emerald-200 rounded-lg shadow-sm">
                                        {beneficiaryIdFront.startsWith('data:application/pdf') ? (
                                            <div className="w-full h-14 flex items-center justify-center bg-slate-100 rounded text-slate-500 font-bold">PDF</div>
                                        ) : (
                                            <img src={beneficiaryIdFront} alt="ID Front" className="w-full h-14 object-cover rounded mb-1" />
                                        )}
                                        <span className="text-slate-600 block truncate font-medium">ID (Front)</span>
                                    </div>
                                )}
                                {beneficiarySignature && (
                                    <div className="p-1.5 bg-white border border-emerald-200 rounded-lg shadow-sm">
                                        <img src={beneficiarySignature} alt="Signature" className="w-full h-14 object-contain rounded mb-1 bg-slate-50" />
                                        <span className="text-slate-600 block truncate font-medium">Signature</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="btn border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-3 px-6 rounded-xl flex items-center gap-2 text-sm w-full sm:w-auto justify-center"
                        >
                            <Printer size={16} />
                            <span>Print Dossier & Receipt</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/dashboard')}
                            className="btn bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3 px-8 rounded-xl shadow-md flex items-center gap-2 text-sm w-full sm:w-auto justify-center"
                        >
                            <span>Return to Dashboard</span>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApplicationForm;
