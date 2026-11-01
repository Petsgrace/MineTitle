from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    FarmerProfileViewSet, TitleDeedApplicationViewSet, RegisterViewSet, PaymentViewSet, AIWhatIfView, AIDistrictRiskView, 
    LoginView, LogoutView, CheckSessionView, SetCSRFCookieView, 
    AdminStaffViewSet, ReportViewSet, UserProfileView, 
    PasswordResetRequestView, PasswordResetConfirmView, IntegrationViewSet, 
    SecureDocumentDownloadView, TrackApplicationView, GISFarmsView, AIDisputePredictionView, BlockchainAuditVerifyView
)

router = DefaultRouter()
router.register(r'profiles', FarmerProfileViewSet, basename='profile')
router.register(r'applications', TitleDeedApplicationViewSet, basename='application')
router.register(r'register', RegisterViewSet, basename='register')
router.register(r'admin/staff', AdminStaffViewSet, basename='admin-staff')
router.register(r'reports', ReportViewSet, basename='report')
router.register(r'integrate', IntegrationViewSet, basename='integrate')
router.register(r'payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('check-session/', CheckSessionView.as_view(), name='check-session'),
    path('user/profile/', UserProfileView.as_view(), name='user-profile'),
    path('csrf-cookie/', SetCSRFCookieView.as_view(), name='csrf-cookie'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('track/', TrackApplicationView.as_view(), name='track-application'),
    path('gis/farms/', GISFarmsView.as_view(), name='gis-farms'),
    path('applications/<int:pk>/ai-dispute-prediction/', AIDisputePredictionView.as_view(), name='ai-dispute-prediction'),
    path('applications/<int:pk>/verify-audit-chain/', BlockchainAuditVerifyView.as_view(), name='verify-audit-chain'),
    path('ai/what-if/', AIWhatIfView.as_view(), name='ai-what-if'),
    path('ai/district-risk/', AIDistrictRiskView.as_view(), name='ai-district-risk'),
    path('applications/<int:application_id>/document/<str:field_name>/', SecureDocumentDownloadView.as_view(), name='secure-document-download'),
    path('', include(router.urls)),
]
